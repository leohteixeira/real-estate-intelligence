import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium, type Browser } from 'playwright';
import { expect, test } from 'vitest';
import { sha256, writeAccessibilityEvidence } from './accessibility-evidence.ts';
import { cleanupAll, preserveCleanup } from './cleanup.ts';
import { allocatePorts } from './fixture.ts';
import { requestHttp } from './http.ts';
import { settlePropertyCaptureStart } from './property-capture.ts';

const artboards = [
  'Components',
  'States',
  'Main',
  'PlaceEN',
  'DesktopPlace',
  'Search',
  'Filters',
  'Property',
  'DesktopProperty',
  'Listing',
  'Ask',
  'AskConfirm',
  'DesktopAsk',
  'LandingMobile',
  'LandingDesktop',
] as const;

test('authored accessibility references retain current design bytes and local fonts at their declared dimensions', async () => {
  const root = new URL('../../', import.meta.url);
  const directory = new URL(
    `apps/web/.impeccable/review/accessibility-authored-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}/`,
    root,
  );
  await mkdir(directory, { recursive: true });
  // Fixed authoring assets, not a directory server or a fabricated business endpoint.
  const names = [
    ...artboards.map((name) => `${name}.dc.html`),
    'tokens.css',
    'components.css',
    'landing.css',
    'map-neighborhood.svg',
    ...['m', 'd'].flatMap((size) => [0, 1, 2, 3, 4].map((stop) => `landing-${size}-${stop}.svg`)),
  ];
  const assets = new Map(
    await Promise.all(
      names.map(async (name) => {
        const bytes = await readFile(new URL(`docs/design/canvas/project/${name}`, root));
        return [name, bytes] as const;
      }),
    ),
  );
  const dependencies = [...assets].map(([file, bytes]) => ({ file, sha256: sha256(bytes) }));
  dependencies.push({
    file: 'apps/web/test-fixtures/artboards/fonts.css',
    sha256: sha256(await readFile(new URL('apps/web/test-fixtures/artboards/fonts.css', root))),
  });
  const [port] = await allocatePorts(1);
  const base = `http://127.0.0.1:${port}`;
  const server = execa(
    'pnpm',
    [
      '--filter',
      '@rei/web',
      'exec',
      'vite',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: fileURLToPath(root), reject: false },
  );
  let browser: Browser | undefined;
  const outside: string[] = [];
  const unavailable: string[] = [];
  const captures: Array<{
    artboard: string;
    width: number;
    height: number;
    full: { file: string; sha256: string };
    top: { file: string; sha256: string };
  }> = [];
  await preserveCleanup(
    async () => {
      await expect
        .poll(
          async () => {
            try {
              return (await requestHttp(`${base}/test-fixtures/artboards/fonts.css`)).status;
            } catch {
              return 0;
            }
          },
          { timeout: 30000, interval: 200 },
        )
        .toBe(200);
      const env = { ...process.env };
      delete env.DISPLAY;
      browser = await chromium.launch({
        channel: 'chromium',
        chromiumSandbox: true,
        env,
        args: ['--ozone-platform=headless'],
      });
      for (const artboard of artboards) {
        const html = assets.get(`${artboard}.dc.html`)!.toString('utf8');
        const dimensions = html.match(/"\$preview":\{"width":(\d+),"height":(\d+)\}/);
        expect(dimensions, `${artboard} authored preview dimensions`).not.toBeNull();
        const width = Number(dimensions![1]);
        const height = Number(dimensions![2]);
        const context = await browser.newContext({
          viewport: { width, height },
          reducedMotion: 'reduce',
        });
        await preserveCleanup(
          async () => {
            await context.route('**/*', async (route) => {
              const url = new URL(route.request().url());
              if (url.origin !== base) {
                outside.push(url.origin);
                await route.abort();
                return;
              }
              const prefix = '/test-fixtures/artboards/';
              const name = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
              const bytes = assets.get(name);
              if (!bytes) {
                await route.continue();
                return;
              }
              const contentType = name.endsWith('.html')
                ? 'text/html'
                : name.endsWith('.svg')
                  ? 'image/svg+xml'
                  : 'text/css';
              const body = name.endsWith('.html')
                ? bytes
                    .toString('utf8')
                    .replace('<script src="./support.js"></script>', '')
                    .replace(
                      /<link href="https:\/\/fonts\.googleapis\.com\/[^"\n]+" rel="stylesheet">/,
                      '<link rel="stylesheet" href="./fonts.css">',
                    )
                : bytes;
              await route.fulfill({ status: 200, contentType, body });
            });
            const page = await context.newPage();
            page.on('response', (response) => {
              if (response.status() >= 400)
                unavailable.push(`${response.status()} ${new URL(response.url()).pathname}`);
            });
            await page.goto(`${base}/test-fixtures/artboards/${artboard}.dc.html`);
            const framing = await settlePropertyCaptureStart(page);
            expect(await page.evaluate(() => document.fonts.check('16px Barlow'))).toBe(true);
            expect(
              await page.evaluate(() => document.fonts.check('600 24px "Barlow Condensed"')),
            ).toBe(true);
            const fullName = `${artboard}-full.png`;
            const topName = `${artboard}-top.png`;
            const full = await page.screenshot({
              path: new URL(fullName, directory).pathname,
              fullPage: true,
            });
            const top = await page.screenshot({
              path: new URL(topName, directory).pathname,
              clip: { x: 0, y: 0, width, height: Math.min(height, 900) },
            });
            captures.push({
              artboard,
              width,
              height,
              full: { file: fullName, sha256: sha256(full) },
              top: { file: topName, sha256: sha256(top) },
            });
            await writeAccessibilityEvidence(directory, `${artboard}.json`, {
              artboard,
              width,
              height,
              framing,
              dependencies,
            });
          },
          () => context.close(),
        );
      }
      expect(outside).toEqual([]);
      expect(unavailable).toEqual([]);
      expect(captures).toHaveLength(artboards.length);
      await writeAccessibilityEvidence(directory, 'references.json', {
        scope: 'Unmodified authored static artboards, not production UI or business API evidence',
        transformations: [
          'Remove the absent canvas-editor support.js only',
          'Replace Google Fonts stylesheet with the repository local Barlow font fixture',
        ],
        browser: browser.version(),
        dependencies,
        captures,
        outside,
        unavailable,
      });
      console.info(`Authored accessibility references: ${fileURLToPath(directory)}`);
    },
    () =>
      cleanupAll(
        async () => browser?.close(),
        async () => {
          server.kill('SIGTERM');
          const stopped = await server;
          expect(stopped.exitCode === 0 || stopped.signal === 'SIGTERM').toBe(true);
        },
      ),
  );
});
