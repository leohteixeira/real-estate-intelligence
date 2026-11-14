import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import type { Page } from 'playwright';
import { expect } from 'vitest';
import {
  parseAskProgressEvent,
  type AskProgressEvent,
} from '../../packages/contracts/dist/index.js';
import type { DatabaseConnection } from '../../packages/infrastructure/dist/index.js';
import { checkAccessibility } from './accessibility.ts';
import { settlePropertyCaptureStart } from './property-capture.ts';
import { copySurfaceEvidence } from './search-campaign.ts';

/** Independent real HTTP oracle; never imports the browser decoder or reducer. */
export function askOracleFrames(text: string): AskProgressEvent[] {
  return text
    .split(/\r?\n\r?\n/)
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const frame = parseAskProgressEvent(
        JSON.parse(
          lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n'),
        ),
      );
      expect(
        lines
          .find((line) => line.startsWith('id:'))
          ?.slice(3)
          .trim(),
      ).toBe(frame.id);
      expect(
        lines
          .find((line) => line.startsWith('event:'))
          ?.slice(6)
          .trim(),
      ).toBe(frame.event);
      return frame;
    });
}
export async function askDatabaseState(connection: DatabaseConnection) {
  const tables = await connection.query<{ table_schema: string; table_name: string }>(
    "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('properties','collection','platform','locations','market','ask','comparables','identity','audit','alerts','public') AND table_type='BASE TABLE' ORDER BY table_schema,table_name",
  );
  const result = [];
  for (const { table_schema: schema, table_name: table } of tables) {
    expect(schema).toMatch(/^[a-z_]+$/);
    expect(table).toMatch(/^[a-z_]+$/);
    const rows = await connection.query<{ count: number; digest: string }>(
      `SELECT count(*)::integer AS count,md5(COALESCE(string_agg(to_jsonb(record)::text,'' ORDER BY to_jsonb(record)::text),'')) AS digest FROM "${schema}"."${table}" record`,
    );
    result.push({ schema, table, ...rows[0] });
  }
  return result;
}
export async function askDockerInventory() {
  const containers = await execa('docker', ['ps', '--all', '--format', '{{.ID}}']);
  const volumes = await execa('docker', ['volume', 'ls', '--format', '{{.Name}}']);
  return {
    containers: containers.stdout.split('\n').filter(Boolean).sort(),
    volumes: volumes.stdout.split('\n').filter(Boolean).sort(),
  };
}
export async function askVersion(project: string, base: string) {
  const root = new URL('../../', import.meta.url);
  const commit = (await execa('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout;
  const source = createHash('sha256');
  const sourceFiles = (await readdir(new URL('apps/web/src/ask/', root)))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes('.test.'))
    .sort()
    .map((file) => `apps/web/src/ask/${file}`);
  sourceFiles.push(
    'apps/web/src/styles/ask.css',
    'apps/web/src/routes.tsx',
    'apps/web/src/places/resources.ts',
    'apps/web/src/main.tsx',
    'apps/web/vite.config.ts',
  );
  for (const file of sourceFiles) source.update(file).update(await readFile(new URL(file, root)));
  const localAssets: Array<{ file: string; sha256: string }> = [];
  for (const file of (await readdir(new URL('apps/web/dist/assets/', root)))
    .filter((name) => /\.(js|css)$/.test(name))
    .sort())
    localAssets.push({
      file,
      sha256: createHash('sha256')
        .update(await readFile(new URL(`apps/web/dist/assets/${file}`, root)))
        .digest('hex'),
    });
  const runtime = [];
  const runtimeAssets: Array<{ file: string; sha256: string }> = [];
  for (const service of ['web', 'api']) {
    const id = (
      await execa('docker', [
        'ps',
        '--all',
        '--quiet',
        '--filter',
        `label=com.docker.compose.project=${project}`,
        '--filter',
        `label=com.docker.compose.service=${service}`,
      ])
    ).stdout.trim();
    expect(id.split('\n')).toHaveLength(1);
    expect(id).not.toBe('');
    runtime.push({
      service,
      image: (await execa('docker', ['inspect', '--format', '{{.Image}}', id])).stdout,
    });
    if (service === 'web') {
      const paths = (
        await execa('docker', [
          'exec',
          id,
          'find',
          '/srv/rei/assets',
          '-maxdepth',
          '1',
          '-type',
          'f',
        ])
      ).stdout
        .split('\n')
        .filter((path) => /\.(js|css)$/.test(path))
        .sort();
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths)
        runtimeAssets.push({
          file: path.split('/').at(-1)!,
          sha256: (await execa('docker', ['exec', id, 'sha256sum', path])).stdout.split(/\s+/)[0]!,
        });
    }
  }
  return {
    commit,
    dirty: Boolean((await execa('git', ['status', '--porcelain'], { cwd: root })).stdout),
    askSourceHash: source.digest('hex'),
    sourceFiles,
    localAssets,
    runtime,
    runtimeAssets,
    base,
    backendArtifactHash: createHash('sha256')
      .update(await readFile(new URL('apps/api/dist/main.js', root)))
      .digest('hex'),
    scope: 'Owned local production images and build, not deployed release identity',
  };
}
export interface AskSurface {
  file: string;
  evidencePath: string;
  hash: string;
}
export async function captureAskSurface(
  page: Page,
  name: string,
  folder: URL,
  version: unknown,
  manifest: AskSurface[],
  directory: URL,
) {
  const captures = new URL('../../apps/web/.impeccable/review/', import.meta.url);
  const fullPage = await settlePropertyCaptureStart(page);
  await page.screenshot({ path: new URL(`${name}.png`, captures).pathname, fullPage: true });
  const viewport = await settlePropertyCaptureStart(page);
  await page.screenshot({ path: new URL(`${name}-top.png`, captures).pathname });
  const axe = await checkAccessibility(page, name);
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    documentHeight: document.documentElement.scrollHeight,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    targets: Array.from(
      document.querySelectorAll<HTMLElement>('a,button,summary,input,select,textarea'),
    )
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: element.className,
          href: element.getAttribute('href'),
          width: rect.width,
          height: rect.height,
        };
      }),
    fonts: {
      content: getComputedStyle(document.querySelector('.ask-follow p')!).fontFamily,
      heading: getComputedStyle(document.querySelector('h1')!).fontFamily,
      barlow: document.fonts.check('400 14px Barlow'),
      condensed: document.fonts.check('600 24px "Barlow Condensed"'),
    },
  }));
  expect(geometry.horizontalOverflow).toBe(false);
  expect(geometry.fonts.content).toContain('Barlow');
  expect(geometry.fonts.barlow).toBe(true);
  expect(geometry.fonts.condensed).toBe(true);
  expect(geometry.targets.filter((target) => target.width < 44 || target.height < 44)).toEqual([]);
  await writeFile(
    new URL(`${name}-interaction.json`, captures),
    JSON.stringify(
      {
        version,
        ...geometry,
        captureStart: { fullPage, viewport },
        axeIncomplete: axe.incomplete,
        manualLimits: [
          'Screen-reader pronunciation/order, daylight focus and zoom require independent human assessment.',
        ],
      },
      null,
      2,
    ),
  );
  const suffixes = ['.png', '-top.png', '-accessibility.json', '-interaction.json'];
  for (const [region, selector] of [
    ['record', '.ask-main-record'],
    ['thread', '.ask-thread'],
    ['confirmation', '.ask-confirmation'],
  ] as const) {
    if (await page.locator(selector).count()) {
      await page
        .locator(selector)
        .screenshot({ path: new URL(`${name}-${region}.png`, captures).pathname });
      suffixes.push(`-${region}.png`);
    }
  }
  for (const suffix of suffixes) {
    const file = `${name}${suffix}`;
    manifest.push({
      file,
      evidencePath: `${folder.pathname.slice(directory.pathname.length)}${file}`,
      hash: await copySurfaceEvidence(new URL(file, captures), new URL(file, folder)),
    });
  }
  await writeFile(
    new URL('surfaces.json', directory),
    JSON.stringify({ version, files: manifest }, null, 2),
  );
}
