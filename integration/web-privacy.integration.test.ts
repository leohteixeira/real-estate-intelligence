import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium, type Browser, type Page } from 'playwright';
import { expect, test } from 'vitest';
import { parseEnabledSourcesResponse } from '../packages/contracts/dist/index.js';
import { DatabaseConnection } from '../packages/infrastructure/dist/index.js';
import { allocatePorts, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { askDatabaseState, askDockerInventory, askVersion } from './support/ask-web-evidence.ts';
import { runAskAttempt } from './support/ask-attempt.ts';
import { runAskCampaign } from './support/ask-campaign.ts';
import { checkAccessibility } from './support/accessibility.ts';
import { settlePropertyCaptureStart } from './support/property-capture.ts';
import { copySurfaceEvidence } from './support/search-campaign.ts';
import { preparedPropertyId, readProperty } from './support/property-reads.ts';

const scenarios = [
  [
    'PRIVACY-001',
    'Document and responsive accessibility',
    'An anonymous visitor and the actual enabled synthetic source',
    'Read directly, reload and keyboard navigate all sections at 390/960/1440 in both locales',
    'Nine sections, exact source attribution and permissions, title/lang, no place context, axe, fonts and targets pass',
  ],
  [
    'PRIVACY-002',
    'Public entry and history',
    'Every public screen with the shared selected locale',
    'Follow the visible privacy footer then navigate back and forward on phone and desktop',
    'Landing, Places, Search, Property, Listing and Ask all reach the document and retain locale',
  ],
  [
    'PRIVACY-003',
    'Read failure and recovery',
    'Actual admitted source and empty response bytes',
    'Refuse, corrupt, hold and cancel source reads then explicitly retry',
    'Static policy survives sanitized bounded errors, manual retry recovers and obsolete requests cannot replace current evidence',
  ],
  [
    'PRIVACY-004',
    'Publication configuration',
    'Absent public values then an explicitly synthetic configured production build',
    'Read controller/contact before and after rebuilding the owned web image',
    'Absent means unavailable with no mailto; safe configured text/mailto appears with the real-processing restriction',
  ],
  [
    'PRIVACY-005',
    'Incumbent reference evidence',
    'Unmodified Components, Main and DesktopPlace references',
    'Capture their authored dimensions on an owned Vite server',
    'Reference bytes/dependencies and capture hashes are recorded without creating a Privacy artboard',
  ],
  [
    'PRIVACY-006',
    'Read-only and cleanup boundaries',
    'Owned stack, SQL baseline and runtime asset hashes',
    'Compare served assets, final database inventory and network observations',
    'No writes, external origins or SQL changes; owned resources removed and foreign resources preserved',
  ],
].map(([id, title, given, when, then]) => ({
  id: id!,
  title: title!,
  area: 'Privacy',
  persona: 'anonymous visitor',
  journey: title!,
  given: given!,
  when: when!,
  then: then!,
  verification: {
    oracle: 'D-069 accepted plan, independent real API and SQL inventories',
    method: 'Native Vitest, Supertest, owned production Compose and sandboxed Chromium',
  },
  dependencies: [],
}));

test('privacy notice is bilingual, reachable, bounded and read-only through owned production HTTP and Chromium', async () => {
  const runId = `privacy-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = new URL(`../apps/web/.impeccable/review/campaigns/${runId}/`, import.meta.url);
  const review = new URL('../apps/web/.impeccable/review/', import.meta.url);
  for (const path of ['catalog/', 'results/', 'fixtures/', 'evidence/'])
    await mkdir(new URL(path, directory), { recursive: true });
  const json = async (path: string, value: unknown) =>
    writeFile(new URL(path, directory), JSON.stringify(value, null, 2));
  await json('catalog/scenarios.json', { scenarios });
  await writeFile(
    new URL('catalog/privacy.feature', directory),
    `Feature: Public privacy notice\n\n${scenarios.map((s) => `  Scenario: ${s.id} ${s.title}\n    Given ${s.given}\n    When ${s.when}\n    Then ${s.then}\n`).join('\n')}`,
  );
  const project = `rei-web-privacy-${randomUUID()}`;
  const campaign = {
    runId,
    project,
    status: 'running',
    startedUtc: new Date().toISOString(),
    stackTornDownUtc: null as string | null,
    scope: 'D-069 anonymous read-only privacy',
    personas: ['anonymous visitor'],
    permittedSideEffects:
      'Owned synthetic fixture preparation only, before SQL baseline; no real source enablement',
    completionCriteria: scenarios.map((s) => s.id),
    exclusions: [
      'Parent visual finish/detector/reviewer/documenter',
      'Human screen reader, daylight and zoom assessment',
      'Enabled licensed/not-verified branches cannot be produced without violating source-register gates: mapped to parser and component tests instead',
    ],
  };
  let fixture: ComposeFixture | undefined,
    browser: Browser | undefined,
    page: Page | undefined,
    connection: DatabaseConnection | undefined;
  let foreign: Awaited<ReturnType<typeof askDockerInventory>> | undefined;
  let before: Awaited<ReturnType<typeof askDatabaseState>> | undefined;
  let version: Awaited<ReturnType<typeof askVersion>> | undefined;
  const manifest: Array<{ file: string; hash: string }> = [];
  const reads: string[] = [],
    outside: string[] = [],
    forbidden: string[] = [];
  let base = '',
    emptyBytes = '',
    sourceBytes = '',
    attemptNumber = 0;
  async function attempt(id: string, work: (folder: URL) => Promise<void>) {
    const attemptId = `${id}-${++attemptNumber}`,
      relative = `evidence/${attemptId}/`,
      folder = new URL(relative, directory),
      startedUtc = new Date().toISOString();
    await mkdir(folder, { recursive: true });
    await runAskAttempt(() => work(folder), {
      captures: [
        {
          name: 'environment.json',
          run: () =>
            writeFile(
              new URL('environment.json', folder),
              JSON.stringify(
                {
                  version: version ?? { project, phase: 'setup' },
                  observedUtc: new Date().toISOString(),
                },
                null,
                2,
              ),
            ),
        },
        {
          name: 'readback.json',
          run: () =>
            writeFile(
              new URL('readback.json', folder),
              JSON.stringify({ url: page?.url(), reads, outside, forbidden }, null, 2),
            ),
        },
        ...(page
          ? [
              {
                name: 'final.png',
                run: () =>
                  page!.screenshot({ path: new URL('final.png', folder).pathname, fullPage: true }),
              },
            ]
          : []),
      ],
      report: ({ failed, actionFailed, produced }) =>
        appendFile(
          new URL('results/attempts.jsonl', directory),
          JSON.stringify({
            attemptId,
            scenarioId: id,
            kind: 'scenario',
            status: failed ? 'failed' : 'approved',
            executorError: actionFailed,
            reason: failed
              ? 'Declared check failed; inspect preserved evidence and test output.'
              : 'All declared native assertions passed.',
            startedUtc,
            finishedUtc: new Date().toISOString(),
            environmentEvidence: `${relative}environment.json`,
            finalUiEvidence: `${relative}final.png`,
            evidence: produced.map((file) => relative + file),
            verification: {
              expected: scenarios.find((s) => s.id === id)!.then,
              observed: failed ? 'Failure preserved' : 'Every scenario assertion passed',
              comparison: 'Independent oracle and persisted/read-only boundary checks',
            },
          }) + '\n',
        ),
    });
  }
  async function capture(name: string) {
    await settlePropertyCaptureStart(page!);
    for (const [suffix, fullPage] of [
      ['.png', true],
      ['-top.png', false],
    ] as const) {
      await page!.screenshot({ path: new URL(`${name}${suffix}`, review).pathname, fullPage });
      manifest.push({
        file: `${name}${suffix}`,
        hash: await copySurfaceEvidence(
          new URL(`${name}${suffix}`, review),
          new URL(`evidence/${name}${suffix}`, directory),
        ),
      });
    }
  }
  await runAskCampaign(
    async () => {
      foreign = await askDockerInventory();
      const [postgres, api, web, reference] = await allocatePorts(4);
      base = `http://127.0.0.1:${web}`;
      const settings = {
        ...process.env,
        NODE_ENV: 'test',
        POSTGRES_DB: 'rei_web_privacy',
        POSTGRES_USER: 'rei_web_privacy',
        POSTGRES_PASSWORD: 'controlled-privacy-fixture',
        POSTGRES_PORT: String(postgres),
        API_PORT: String(api),
        WEB_PORT: String(web),
        VITE_PRIVACY_CONTROLLER_NAME: '',
        VITE_PRIVACY_CONTACT_EMAIL: '',
        OTEL_EXPORTER_OTLP_ENDPOINT: '',
      };
      fixture = new ComposeFixture(project, settings, { preparedSearch: true });
      await fixture.up(['--build', 'postgres', 'migrations', 'api', 'web']);
      const database = new URL(`postgres://127.0.0.1:${postgres}/rei_web_privacy`);
      database.username = settings.POSTGRES_USER;
      database.password = settings.POSTGRES_PASSWORD;
      connection = new DatabaseConnection(database.toString());
      const sourceResponse = await requestHttp(`${base}/api/v1/collection/sources`);
      expect(sourceResponse.status).toBe(200);
      sourceBytes = await sourceResponse.text();
      const oracle = parseEnabledSourcesResponse(await sourceResponse.json());
      expect(oracle.sources.map((source) => source.sourceId)).toEqual([
        'synthetic-data',
        'synthetic-portal-aurora',
        'synthetic-portal-brisa',
        'synthetic-portal-cobalto',
      ]);
      // Only already-enabled repository fixtures are toggled during preparation.
      // No real source is enabled and no source gate is bypassed.
      const enabled = await connection.query<{ source_id: string; enabled_at: Date }>(
        "SELECT source_id,enabled_at FROM collection.source_register WHERE enabled=true AND source_category='synthetic-listing' ORDER BY source_id",
      );
      await preserveCleanup(
        async () => {
          await connection!.query(
            "UPDATE collection.source_register SET enabled=false,enabled_at=NULL WHERE enabled=true AND source_category='synthetic-listing'",
          );
          const response = await requestHttp(`${base}/api/v1/collection/sources`);
          expect(parseEnabledSourcesResponse(await response.json()).sources).toEqual([]);
          emptyBytes = await response.text();
        },
        async () => {
          for (const source of enabled)
            await connection!.query(
              "UPDATE collection.source_register SET enabled=true,enabled_at=$1 WHERE source_id=$2 AND source_category='synthetic-listing'",
              [source.enabled_at, source.source_id],
            );
        },
      );
      before = await askDatabaseState(connection);
      version = await askVersion(project, base);
      const privacyFiles = [
        'apps/web/src/privacy/PrivacyNotice.tsx',
        'apps/web/src/privacy/privacy-client.ts',
        'apps/web/src/privacy/privacy-resources.ts',
        'apps/web/src/config.ts',
        'apps/web/src/styles/privacy.css',
        'apps/web/src/shell/AppShell.tsx',
        'apps/web/src/landing/LandingPage.tsx',
        'apps/web/src/landing/copy.ts',
        'apps/web/src/landing/landing.css',
        'apps/web/src/places/locale.ts',
        'apps/web/src/places/resources.ts',
        'apps/web/src/routes.tsx',
        'apps/web/src/main.tsx',
        'apps/web/vite.config.ts',
        'apps/web/src/api/client.ts',
        'apps/web/src/places/place-queries.ts',
        'apps/web/src/shell/public-routes.ts',
        'packages/contracts/src/collection/enabled-source.dto.ts',
        'packages/contracts/src/collection/index.ts',
        'packages/contracts/src/shared/wire.ts',
        'docker/web.Dockerfile',
        'compose.yaml',
      ];
      const hashes = await Promise.all(
        privacyFiles.map(async (file) => ({
          file,
          sha256: createHash('sha256')
            .update(await readFile(new URL(`../${file}`, import.meta.url)))
            .digest('hex'),
        })),
      );
      const privacySourceHash = createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
      const absentVersion = { ...version, privacyFiles: hashes, privacySourceHash };
      await json('version-absent.json', absentVersion);
      await json('fixtures/oracles.json', {
        enabled: oracle,
        empty: JSON.parse(emptyBytes),
        branchMapping:
          'Licensed/not-verified: enabled-source.dto.test.ts and PrivacyNotice.test.tsx. Existing DB gates prohibit enabled not-verified and synthetic licensed; real sources remain disabled.',
      });
      await json('inventory.json', {
        project,
        base,
        publicSourceIds: oracle.sources.map((s) => s.sourceId),
        preparation: 'Temporary synthetic-only disable restored before SQL baseline',
        fixtureSha256: createHash('sha256').update(sourceBytes).update(emptyBytes).digest('hex'),
      });
      const browserEnv = { ...process.env };
      delete browserEnv.DISPLAY;
      browser = await chromium.launch({
        executablePath: chromium.executablePath(),
        chromiumSandbox: true,
        env: browserEnv,
        args: [
          '--ozone-platform=headless',
          '--disable-vulkan-surface',
          '--use-gl=angle',
          '--use-angle=swiftshader-webgl',
        ],
        ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
      });
      const context = await browser.newContext({
        viewport: { width: 390, height: 1142 },
        reducedMotion: 'reduce',
      });
      await context.addInitScript(() => {
        if (!localStorage.getItem('rei.locale')) localStorage.setItem('rei.locale', 'en');
      });
      await context.route('**/*', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin !== base) {
          outside.push(url.origin);
          await route.abort();
        } else if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
          forbidden.push(`${request.method()} ${url.pathname}`);
          await route.abort();
        } else await route.continue();
      });
      context.on('request', (request) => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/')) reads.push(url.pathname + url.search);
      });
      page = await context.newPage();
      const view = page;
      const sourceVisible = () =>
        expect
          .poll(() => view.locator('.privacy-source h3').allTextContents())
          .toEqual(oracle.sources.map((s) => s.displayLabel));
      await attempt('PRIVACY-001', async () => {
        for (const locale of ['pt-BR', 'en'] as const)
          for (const width of [390, 960, 1440]) {
            await view.setViewportSize({ width, height: width === 390 ? 1142 : 1142 });
            const start = reads.length;
            await view.goto(`${base}/privacy`);
            await view
              .getByRole('button', { name: locale === 'en' ? 'English' : 'Português', exact: true })
              .first()
              .click();
            await sourceVisible();
            expect(await view.locator('.privacy-document h2').count()).toBe(9);
            expect(
              await view.locator('.plate,.crumbs,.place-navigation,[aria-current="page"]').count(),
            ).toBe(0);
            expect(await view.locator('html').getAttribute('lang')).toBe(locale);
            expect(await view.title()).toBe(
              `${locale === 'en' ? 'Privacy' : 'Privacidade'} · Real Estate Intelligence`,
            );
            expect(reads.slice(start).every((path) => path === '/api/v1/collection/sources')).toBe(
              true,
            );
            expect(await view.locator('a[href^="mailto:"]').count()).toBe(0);
            expect(await view.locator('.privacy-source dd').allTextContents()).toEqual(
              Array(oracle.sources.length * 3).fill(locale === 'en' ? 'allowed' : 'permitida'),
            );
            const link = view.locator('.privacy-contents a[href="#retention"]');
            await link.focus();
            await view.keyboard.press('Tab');
            await view.keyboard.press('Shift+Tab');
            expect(
              await view.evaluate(
                () =>
                  getComputedStyle(
                    document.querySelector('.privacy-contents a[href="#retention"]')!,
                  ).outlineStyle,
              ),
            ).not.toBe('none');
            await view.keyboard.press('Enter');
            expect(new URL(view.url()).hash).toBe('#retention');
            await view.reload();
            await sourceVisible();
            const name = `privacy-${width}-${locale}`;
            await capture(name);
            await checkAccessibility(view, name);
            manifest.push({
              file: `${name}-accessibility.json`,
              hash: await copySurfaceEvidence(
                new URL(`${name}-accessibility.json`, review),
                new URL(`evidence/${name}-accessibility.json`, directory),
              ),
            });
            const geometry = await view.evaluate(() => ({
              overflow: document.documentElement.scrollWidth > innerWidth,
              contentFont: getComputedStyle(document.querySelector('.privacy-opening p')!)
                .fontFamily,
              barlow: document.fonts.check('400 15px Barlow'),
              targets: Array.from(document.querySelectorAll<HTMLElement>('a,button'))
                .filter(
                  (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden',
                )
                .map((e) => {
                  const r = e.getBoundingClientRect();
                  return { width: r.width, height: r.height, href: e.getAttribute('href') };
                }),
            }));
            expect(geometry.overflow).toBe(false);
            expect(geometry.contentFont).toContain('Barlow');
            expect(geometry.barlow).toBe(true);
            expect(geometry.targets.filter((t) => t.width < 44 || t.height < 44)).toEqual([]);
            await json(`evidence/${name}-interaction.json`, geometry);
          }
      });
      await attempt('PRIVACY-002', async () => {
        const property = await readProperty(base, preparedPropertyId(1));
        const listingId = property.property.listings[0]!.id;
        for (const locale of ['pt-BR', 'en'] as const)
          for (const width of [390, 1440])
            for (const path of [
              '/',
              '/places/sao-paulo-bela-vista',
              '/search/sao-paulo-bela-vista',
              `/properties/${preparedPropertyId(1)}`,
              `/listings/${listingId}`,
              '/ask/sao-paulo-bela-vista',
            ]) {
              await view.setViewportSize({ width, height: 1142 });
              await view.goto(base + path);
              await view
                .getByRole('button', {
                  name: locale === 'en' ? 'English' : 'Português',
                  exact: true,
                })
                .first()
                .click();
              const footer = view.locator('a[href="/privacy"]').filter({ visible: true }).first();
              await footer.scrollIntoViewIfNeeded();
              const name = `privacy-entry-${path === '/' ? 'landing' : path.split('/')[1]}-${width}-${locale}`;
              await view.screenshot({ path: new URL(`evidence/${name}.png`, directory).pathname });
              manifest.push({
                file: `${name}.png`,
                hash: createHash('sha256')
                  .update(await readFile(new URL(`evidence/${name}.png`, directory)))
                  .digest('hex'),
              });
              await footer.focus();
              await view.keyboard.press('Enter');
              await sourceVisible();
              expect(new URL(view.url()).pathname).toBe('/privacy');
              expect(await view.locator('html').getAttribute('lang')).toBe(locale);
              await view.goBack();
              expect(new URL(view.url()).pathname).toBe(path);
              await view.goForward();
              await sourceVisible();
            }
      });
      await attempt('PRIVACY-003', async () => {
        await view.goto(`${base}/privacy`);
        await sourceVisible();
        let mode: 'refused' | 'malformed' | 'empty' | 'held' | 'valid' = 'refused';
        const held = { release: () => undefined as void };
        await view.route('**/api/v1/collection/sources', async (route) => {
          if (mode === 'held')
            await new Promise<void>((resolve) => {
              held.release = resolve;
            });
          if (mode === 'refused')
            await route.fulfill({
              status: 503,
              body: sourceBytes,
              contentType: 'application/json',
            });
          else
            await route.fulfill({
              status: 200,
              body:
                mode === 'empty'
                  ? emptyBytes
                  : mode === 'malformed'
                    ? sourceBytes.slice(0, -1)
                    : sourceBytes,
              contentType: 'application/json',
            });
        });
        await view.reload();
        await view.getByRole('alert').waitFor();
        expect(await view.locator('.privacy-document h2').count()).toBe(9);
        const count = reads.length;
        expect(await view.locator('.privacy-sources').count()).toBe(0);
        mode = 'malformed';
        await view.getByRole('button', { name: /Try again|Tentar novamente/ }).click();
        await view.getByRole('alert').waitFor();
        expect(reads.length).toBe(count + 1);
        mode = 'empty';
        await view.getByRole('button', { name: /Try again|Tentar novamente/ }).click();
        await expect
          .poll(() => view.locator('#sources').textContent())
          .toMatch(/No source is enabled|Nenhuma fonte/);
        expect(await view.getByRole('alert').count()).toBe(0);
        mode = 'held';
        await view.reload();
        await view.getByRole('status').waitFor();
        await view.getByRole('alert').waitFor({ timeout: 15000 });
        mode = 'valid';
        held.release?.();
        await view.getByRole('button', { name: /Try again|Tentar novamente/ }).click();
        await sourceVisible();
        mode = 'held';
        held.release = () => undefined;
        await view.reload();
        await view.getByRole('status').waitFor();
        await view.goto(`${base}/places/sao-paulo-bela-vista`);
        mode = 'valid';
        held.release?.();
        await view.goto(`${base}/privacy`);
        await sourceVisible();
        await view.unroute('**/api/v1/collection/sources');
        await capture('privacy-recovered');
      });
      await attempt('PRIVACY-004', async () => {
        await view.goto(`${base}/privacy`);
        await sourceVisible();
        expect(await view.locator('a[href^="mailto:"]').count()).toBe(0);
        await fixture!.up(['--build', 'web'], {
          ...settings,
          VITE_PRIVACY_CONTROLLER_NAME: 'Synthetic Privacy Controller',
          VITE_PRIVACY_CONTACT_EMAIL: 'privacy@example.test',
        });
        version = await askVersion(project, base);
        await json('version-configured.json', {
          ...version,
          privacyFiles: hashes,
          privacySourceHash,
        });
        await view.reload();
        await sourceVisible();
        expect(await view.getByText('Synthetic Privacy Controller', { exact: true }).count()).toBe(
          1,
        );
        expect(
          await view.getByRole('link', { name: 'privacy@example.test' }).getAttribute('href'),
        ).toBe('mailto:privacy@example.test');
        expect(await view.locator('#basis').textContent()).toMatch(
          /Real processing remains disabled|O tratamento real permanece desabilitado/,
        );
        await capture('privacy-configured');
      });
      await attempt('PRIVACY-005', async (folder) => {
        const referenceBase = `http://127.0.0.1:${reference}`;
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
            String(reference),
            '--strictPort',
          ],
          { cwd: fileURLToPath(new URL('..', import.meta.url)), reject: false },
        );
        await preserveCleanup(
          async () => {
            await expect
              .poll(
                async () => {
                  try {
                    return (
                      await requestHttp(`${referenceBase}/test-fixtures/artboards/Main.dc.html`)
                    ).status;
                  } catch {
                    return 0;
                  }
                },
                { timeout: 30000, interval: 200 },
              )
              .toBe(200);
            for (const [file, width, height] of [
              ['Main.dc.html', 390, 1706],
              ['Components.dc.html', 1280, 1882],
              ['DesktopPlace.dc.html', 1440, 1142],
            ] as const) {
              const ctx = await browser!.newContext({
                viewport: { width, height },
                reducedMotion: 'reduce',
              });
              await preserveCleanup(
                async () => {
                  const external: string[] = [];
                  await ctx.route('**/*', async (route) => {
                    if (new URL(route.request().url()).origin !== referenceBase) {
                      external.push(new URL(route.request().url()).origin);
                      await route.abort();
                    } else await route.continue();
                  });
                  const referencePage = await ctx.newPage();
                  await referencePage.goto(`${referenceBase}/test-fixtures/artboards/${file}`);
                  await settlePropertyCaptureStart(referencePage);
                  const name = `privacy-reference-${file.replace('.dc.html', '')}.png`;
                  await referencePage.screenshot({
                    path: new URL(name, review).pathname,
                    fullPage: true,
                  });
                  manifest.push({
                    file: name,
                    hash: await copySurfaceEvidence(new URL(name, review), new URL(name, folder)),
                  });
                  expect(external).toEqual([]);
                  const dependencies = await Promise.all(
                    [file, 'tokens.css', 'components.css'].map(async (dependency) => ({
                      file: dependency,
                      sha256: createHash('sha256')
                        .update(
                          await readFile(
                            new URL(`../docs/design/canvas/project/${dependency}`, import.meta.url),
                          ),
                        )
                        .digest('hex'),
                    })),
                  );
                  await writeFile(
                    new URL(`${file}.json`, folder),
                    JSON.stringify({ width, height, dependencies }, null, 2),
                  );
                },
                () => ctx.close(),
              );
            }
          },
          async () => {
            server.kill('SIGTERM');
            const stopped = await server;
            expect(stopped.exitCode === 0 || stopped.signal === 'SIGTERM').toBe(true);
          },
        );
      });
      await attempt('PRIVACY-006', async () => {
        expect(outside).toEqual([]);
        expect(forbidden).toEqual([]);
        const servedAssets = [];
        for (const asset of version!.runtimeAssets) {
          const response = await requestHttp(`${base}/assets/${asset.file}`);
          expect(response.status).toBe(200);
          const sha256 = createHash('sha256')
            .update(await response.text())
            .digest('hex');
          expect(sha256).toBe(asset.sha256);
          servedAssets.push({ file: asset.file, sha256 });
        }
        const after = await askDatabaseState(connection!);
        expect(after).toEqual(before);
        await json('sql-effects.json', { before, after, unchanged: true });
        await json('read-only-boundaries.json', { outside, forbidden, reads, servedAssets });
        await json('surfaces.json', { files: manifest });
      });
      await json('findings.json', []);
      await writeFile(
        new URL('results/report.md', directory),
        '# Privacy campaign\n\nSix distinct scenarios approved across two explicitly identified configuration builds.\nReal source enablement was never performed. Licensed/not-verified rendering is covered by focused\ncomponent/parser tests because source-register gates prohibit actual enabled synthetic examples.\nHuman visual finish and assistive-technology review remain with the parent.\n\nReproduce: `pnpm exec vitest run --config vitest.integration.config.ts integration/web-privacy.integration.test.ts`.\n',
      );
    },
    campaign,
    {
      release: [async () => browser?.close(), async () => connection?.close()],
      down: async () => {
        if (fixture) await fixture.down();
      },
      verifyForeignResources: async () => {
        if (foreign) {
          const after = await askDockerInventory();
          expect(after.containers).toEqual(expect.arrayContaining(foreign.containers));
          expect(after.volumes).toEqual(expect.arrayContaining(foreign.volumes));
        }
      },
      report: (receipt) =>
        preserveCleanup(
          () => json('teardown.json', { project, ...receipt }),
          () => json('campaign.json', campaign),
        ),
    },
  );
}, 600000);
