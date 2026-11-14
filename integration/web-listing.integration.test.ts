import { mkdir, writeFile, appendFile, readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { expect, test } from 'vitest';
import {
  allocatePorts,
  withPreparedSearchCampaign as withCampaign,
  preserveCleanup,
} from './support/fixture.ts';
import { copySurfaceEvidence, runSearchCampaign } from './support/search-campaign.ts';
import { displayedEvidenceLabel, displayedSourceName } from './support/api-labels.ts';
import { requestHttp } from './support/http.ts';
import { checkAccessibility } from './support/accessibility.ts';
import { settlePropertyCaptureStart } from './support/property-capture.ts';
import {
  readListing,
  readListingContext,
  checkListing,
  preparedListingId,
  listingDate,
} from './support/listing-reads.ts';

const scenarios = [
  [
    'LISTING-001',
    'Search → Property → Listing → Property → exact Search and history',
    'Applied safe filters/order',
    'Follow native Property and explicit Listing entry, then return and use back/forward',
    'The exact Search URL and verified Property membership survive; Search stays current',
  ],
  [
    'LISTING-002',
    'Original events and permitted description versions',
    'Real prepared Listing 104 and returned Listing 109',
    'Inspect original event metadata, price before/after and allowed versions',
    'Every fact agrees with parsed API; creation has no invented price; removal is not sale',
  ],
  [
    'LISTING-003',
    'Description rights and snapshot limitations',
    'Real supplementary Listing 991, 992 and 993',
    'Open each in both locales, inspect descriptions, snapshot dates and null/zero fields',
    'Denied bodies/comparison are absent, expired evidence stays readable and retained counts/unknown expiry are honest',
  ],
  [
    'LISTING-004',
    'Identity and Listing read failures',
    'Malformed/v4, absent v7 and bounded HTTP/read faults',
    'Open each and manually recover against the real API, then refetch stale cached Listing through browser history',
    'No invalid read, no private payload, no automatic retry; known detail survives and retry recovers',
  ],
  [
    'LISTING-005',
    'Independent Property context',
    'Ten-second stalled response, context failure and parsed wrong-membership response',
    'Read Listing independently, then retry contextual Property',
    'Neutral ancestry/count until verified; Listing remains readable and only context retries',
  ],
  [
    'LISTING-006',
    'Six localized responsive surfaces',
    'Real Listing readbacks and local fonts',
    'Inspect PT/EN at 390, 960 and 1440 with keyboard, geometry and full-page axe',
    'All visible controls ≥44px, focus works, no overflow or external/write request; immutable captures start at scroll zero',
  ],
  [
    'LISTING-007',
    'Authored Listing reference',
    'Unmodified 390×1782 Listing.dc.html',
    'Serve fixed dev-only reference with local fonts',
    'Authored dimensions, source hash and independent reference capture remain reproducible',
  ],
].map(([id, title, given, when, then]) => ({
  id: id!,
  title: title!,
  given: given!,
  when: when!,
  then: then!,
  area: 'Listing',
  persona: 'public visitor',
  journey: title!,
  dependencies: [],
  verification: {
    oracle: 'Story 6.8 / D-062 and separately parsed real public HTTP Listing + Property',
    method:
      'Owned production Compose/Testcontainers, Supertest and sandboxed Chromium; prepared evidence does not replace persisted provenance campaign',
  },
}));

test('Listing follows rights, provenance, context and exact navigation through owned real HTTP and Chromium', async () => {
  const runId = `listing-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = new URL(`../apps/web/.impeccable/review/campaigns/${runId}/`, import.meta.url);
  const captures = new URL('../apps/web/.impeccable/review/', import.meta.url);
  for (const name of ['catalog/', 'results/', 'evidence/', 'fixtures/'])
    await mkdir(new URL(name, directory), { recursive: true });
  await writeFile(
    new URL('catalog/scenarios.json', directory),
    JSON.stringify({ scenarios }, null, 2),
  );
  await writeFile(
    new URL('catalog/listing.feature', directory),
    scenarios
      .map(
        (s) =>
          `Scenario: ${s.id} ${s.title}\n  Given ${s.given}\n  When ${s.when}\n  Then ${s.then}`,
      )
      .join('\n\n'),
  );
  const project = `rei-web-listing-${randomUUID()}`;
  const [postgres, api, web, reference] = await allocatePorts(4);
  const base = `http://127.0.0.1:${web}`,
    referenceBase = `http://127.0.0.1:${reference}`;
  const campaign = {
    runId,
    status: 'running',
    scope: 'Story 6.8 prepared public Listing journeys',
    personas: ['public visitor'],
    exclusions: [
      'Persisted correction/revocation/expiry semantics remain owned by listing-provenance.integration.test.ts',
      'Live sources/models, VPS, protected Operations, downloads',
      'Parent finite visual comparison and independent finish/documentation',
    ],
    targetUrls: [base, referenceBase],
    dataOwnership: project,
    allowedSideEffects: [
      'Owned Compose resources',
      'Owned Vite reference process',
      'Local evidence',
    ],
    completionCriteria:
      'Seven semantic scenarios, six localized responsive surfaces, immutable API/screenshot evidence and exact owned teardown',
    stackTornDownUtc: null as string | null,
  };
  const commit = (
    await execa('git', ['rev-parse', 'HEAD'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
    })
  ).stdout;
  const sourceHash = createHash('sha256'),
    artifactHash = createHash('sha256');
  for (const name of (await readdir(new URL('../apps/web/src/listings/', import.meta.url)))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes('.test.'))
    .sort())
    sourceHash
      .update(name)
      .update(await readFile(new URL(`../apps/web/src/listings/${name}`, import.meta.url)));
  for (const file of [
    'styles/listing.css',
    'shell/AppShell.tsx',
    'properties/PropertyProvenance.tsx',
    'places/place-client.ts',
    'places/place-queries.ts',
    'routes.tsx',
  ])
    sourceHash
      .update(file)
      .update(await readFile(new URL(`../apps/web/src/${file}`, import.meta.url)));
  const builtAssets = (await readdir(new URL('../apps/web/dist/assets/', import.meta.url)))
    .filter((file) => /\.(js|css)$/.test(file))
    .sort();
  for (const name of builtAssets)
    artifactHash
      .update(name)
      .update(await readFile(new URL(`../apps/web/dist/assets/${name}`, import.meta.url)));
  const version = {
    commit,
    dirty: true,
    listingSourceHash: sourceHash.digest('hex'),
    localWebArtifactHash: artifactHash.digest('hex'),
    webArtifactHash: null as string | null,
    webImageId: null as string | null,
    backendArtifactHash: createHash('sha256')
      .update(await readFile(new URL('../apps/api/dist/main.js', import.meta.url)))
      .digest('hex'),
    project,
    observedUtc: new Date().toISOString(),
  };
  const env = {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: '1',
    COMPOSE_ENV_FILES: '',
    NODE_ENV: 'test',
    POSTGRES_DB: 'rei_web_listing',
    POSTGRES_USER: 'rei_web_listing',
    POSTGRES_PASSWORD: 'controlled-listing-fixture',
    POSTGRES_PORT: String(postgres),
    API_PORT: String(api),
    WEB_PORT: String(web),
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  const browserEnv = { ...process.env };
  delete browserEnv.DISPLAY;
  async function inventory() {
    const containers = (
      await execa('docker', ['ps', '--all', '--format', '{{.ID}}'], { timeout: 30000 })
    ).stdout
      .split('\n')
      .filter(Boolean);
    const volumes = (
      await execa('docker', ['volume', 'ls', '--format', '{{.Name}}'], { timeout: 30000 })
    ).stdout
      .split('\n')
      .filter(Boolean);
    return { containers, volumes };
  }
  const foreignBaseline = await inventory();
  let browser: Browser | undefined,
    attempts = 0;
  const manifest: Array<{ file: string; hash: string; evidencePath: string }> = [];
  const outside: string[] = [],
    writes: string[] = [],
    reads: string[] = [];
  await writeFile(
    new URL('inventory.json', directory),
    JSON.stringify(
      {
        project,
        publicListingIds: [104, 109, 991, 992, 993].map(preparedListingId),
        preparation: 'Repository-owned synthetic public adapter; no source or acquisition mutation',
        foreignBaseline,
      },
      null,
      2,
    ),
  );
  await runSearchCampaign(
    async () => {
      await withCampaign(async ({ command }) => {
        await command(
          'docker',
          [
            'compose',
            '--file',
            'compose.yaml',
            '--project-name',
            project,
            'up',
            '--detach',
            '--build',
            '--wait',
            'postgres',
            'migrations',
            'api',
            'web',
          ],
          { env, timeout: 240000, maxBuffer: 10 * 1024 * 1024 },
        );
        const ownedWeb = (
          await execa('docker', [
            'ps',
            '--quiet',
            '--filter',
            `label=com.docker.compose.project=${project}`,
            '--filter',
            'label=com.docker.compose.service=web',
          ])
        ).stdout.trim();
        expect(ownedWeb).toMatch(/^[a-f0-9]{12,64}$/);
        version.webImageId = (
          await execa('docker', ['inspect', '--format', '{{.Image}}', ownedWeb])
        ).stdout.trim();
        const runtimePaths = (
          await execa('docker', [
            'exec',
            ownedWeb,
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
        expect(runtimePaths.length).toBeGreaterThan(0);
        const servedArtifacts = [];
        const runtimeHash = createHash('sha256');
        for (const path of runtimePaths) {
          const name = path.split('/').at(-1)!;
          const response = await requestHttp(`${base}/assets/${name}`);
          expect(response.status).toBe(200);
          const content = await response.text();
          const servedHash = createHash('sha256').update(content).digest('hex');
          const builtHash = (
            await execa('docker', ['exec', ownedWeb, 'sha256sum', path])
          ).stdout.split(/\s+/)[0];
          expect(servedHash).toBe(builtHash);
          runtimeHash.update(name).update(content);
          servedArtifacts.push({ name, servedHash, builtHash });
        }
        version.webArtifactHash = runtimeHash.digest('hex');
        await writeFile(
          new URL('artifact-readback.json', directory),
          JSON.stringify({ version, servedArtifacts }, null, 2),
        );
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
          viewport: { width: 390, height: 1782 },
          reducedMotion: 'reduce',
        });
        await context.addInitScript(() => {
          if (!localStorage.getItem('rei.locale')) localStorage.setItem('rei.locale', 'pt-BR');
        });
        await context.route('**/*', async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (url.origin !== base) {
            outside.push(url.origin);
            await route.abort();
          } else if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
            writes.push(request.method());
            await route.abort();
          } else {
            if (url.pathname.startsWith('/api/')) reads.push(url.pathname + url.search);
            await route.continue();
          }
        });
        const page = await context.newPage();
        async function copy(file: string, folder: URL) {
          manifest.push({
            file,
            evidencePath: `${folder.pathname.slice(directory.pathname.length)}${file}`,
            hash: await copySurfaceEvidence(new URL(file, captures), new URL(file, folder)),
          });
          await writeFile(
            new URL('surfaces.json', directory),
            JSON.stringify({ version, files: manifest }, null, 2),
          );
        }
        async function capture(view: Page, name: string, folder: URL) {
          const fullPage = await settlePropertyCaptureStart(view);
          await view.screenshot({
            path: new URL(`${name}.png`, captures).pathname,
            fullPage: true,
          });
          const viewport = await settlePropertyCaptureStart(view);
          await view.screenshot({
            path: new URL(`${name}-top.png`, captures).pathname,
            fullPage: false,
          });
          const axe = await checkAccessibility(view, name);
          const geometry = await view.evaluate(() => ({
            hasListingPlate: document.querySelector('.listing-head') !== null,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            documentHeight: document.documentElement.scrollHeight,
            targets: [
              ...document.querySelectorAll<HTMLElement>('a, button, input, select, summary'),
            ]
              .filter(
                (element) =>
                  element.checkVisibility() &&
                  element.getBoundingClientRect().width > 0 &&
                  !element.closest('[inert]'),
              )
              .map((element) => ({
                label: element.textContent?.trim(),
                width: element.getBoundingClientRect().width,
                height: element.getBoundingClientRect().height,
              })),
            fonts: {
              content: getComputedStyle(
                document.querySelector('.listing-description p, main p') ?? document.body,
              ).fontFamily,
              heading: getComputedStyle(document.querySelector('h1') ?? document.body).fontFamily,
              barlowLoaded: document.fonts.check('400 14px Barlow'),
              condensedLoaded: document.fonts.check('600 24px "Barlow Condensed"'),
            },
          }));
          expect(geometry.horizontalOverflow).toBe(false);
          expect(
            geometry.targets.filter((target) => target.width < 44 || target.height < 44),
          ).toEqual([]);
          expect(geometry.fonts.content).toContain('Barlow');
          expect(geometry.fonts.barlowLoaded).toBe(true);
          if (geometry.hasListingPlate) expect(geometry.fonts.condensedLoaded).toBe(true);
          await writeFile(
            new URL(`${name}-interaction.json`, captures),
            JSON.stringify(
              {
                url: view.url(),
                version,
                ...geometry,
                captureStart: { fullPage, viewport },
                axeIncomplete: axe.incomplete,
                manual: ['Screen-reader speech, daylight focus and zoom require human assessment'],
              },
              null,
              2,
            ),
          );
          for (const suffix of ['.png', '-top.png', '-accessibility.json', '-interaction.json'])
            await copy(`${name}${suffix}`, folder);
          for (const [region, selector] of [
            ['facts', '.listing-pair--facts'],
            ['events', '.listing-history'],
            ['description', '.listing-description'],
          ] as const)
            if (await view.locator(selector).count()) {
              await view
                .locator(selector)
                .screenshot({ path: new URL(`${name}-${region}.png`, captures).pathname });
              await copy(`${name}-${region}.png`, folder);
            }
        }
        async function attempt(
          id: string,
          action: (folder: URL) => Promise<void | { finalUiFile: string }>,
        ) {
          const attemptId = `${id}-${++attempts}`,
            folder = new URL(`evidence/${attemptId}/`, directory),
            startedUtc = new Date().toISOString();
          await mkdir(folder, { recursive: true });
          let failure: unknown;
          let result: void | { finalUiFile: string } = undefined;
          try {
            result = await action(folder);
          } catch (error) {
            failure = error;
          }
          await page.screenshot({ path: new URL('final.png', folder).pathname, fullPage: true });
          await writeFile(
            new URL('environment.json', folder),
            JSON.stringify(
              { version, base, referenceBase, observedUtc: new Date().toISOString() },
              null,
              2,
            ),
          );
          await writeFile(
            new URL('readback.json', folder),
            JSON.stringify(
              {
                version,
                url: page.url(),
                reads,
                outside,
                writes,
                body: await page.locator('body').textContent(),
                failure: failure instanceof Error ? failure.message : null,
              },
              null,
              2,
            ),
          );
          const relative = `evidence/${attemptId}/`;
          const scenario = scenarios.find((item) => item.id === id)!;
          await appendFile(
            new URL('results/attempts.jsonl', directory),
            `${JSON.stringify({ attemptId, scenarioId: id, kind: 'scenario', status: failure ? 'inconclusive' : 'approved', startedUtc, finishedUtc: new Date().toISOString(), executorError: false, reason: failure ? 'Untriaged assertion/setup failure; inspect evidence before attributing a product or executor defect' : 'All declared scenario checks passed against separately parsed API facts and captured UI', environmentEvidence: `${relative}environment.json`, finalUiEvidence: `${relative}${result?.finalUiFile ?? 'final.png'}`, evidence: [`${relative}readback.json`], verification: { expected: scenario.then, observed: failure instanceof Error ? failure.message : 'Every scenario assertion passed; exact UI facts and network boundaries are recorded in readback and immutable surfaces', comparison: failure ? 'Declared checks did not complete; not counted as a product failure or conclusive coverage' : 'API facts, user navigation, rights and error recovery satisfy declared scenario checks' } })}\n`,
          );
          if (failure) throw failure;
        }
        const canonical = await readListing(base, preparedListingId(104)),
          property = await readListingContext(base, canonical);
        await writeFile(
          new URL('fixtures/listing-104.json', directory),
          JSON.stringify(canonical, null, 2),
        );
        await writeFile(
          new URL('fixtures/property-context.json', directory),
          JSON.stringify(property, null, 2),
        );
        const applied = '/search/sao-paulo-bela-vista?sort=most-recent&returnedToMarket=false';
        await attempt('LISTING-001', async () => {
          await page.goto(`${base}${applied}`);
          const row = page.locator(`a.prow[href*="${canonical.listing.propertyId}"]`);
          await expect.poll(() => row.count()).toBe(1);
          await row.click();
          const source = page.locator(`#property-listing-${canonical.listing.id}`);
          await expect.poll(() => source.count()).toBe(1);
          await page
            .locator('.property-source-disclosure')
            .filter({ has: source })
            .locator(':scope > summary')
            .click();
          const entry = source.getByRole('link', {
            name: `Inspecionar anúncio na ${displayedSourceName(canonical.listing.source, 'pt-BR')}`,
          });
          expect(await entry.getAttribute('href')).toBe(
            `/listings/${canonical.listing.id}?returnTo=${encodeURIComponent(applied)}`,
          );
          await entry.focus();
          await page.keyboard.press('Enter');
          await checkListing(page, canonical, property, 'pt-BR');
          await page.getByRole('link', { name: 'Voltar ao imóvel' }).click();
          await expect
            .poll(() => page.getByRole('link', { name: 'Voltar à busca' }).getAttribute('href'))
            .toBe(applied);
          await page.getByRole('link', { name: 'Voltar à busca' }).click();
          expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(applied);
          await page.goBack();
          await expect.poll(() => page.locator('.property-details').count()).toBe(1);
          await page.goBack();
          await checkListing(page, canonical, property, 'pt-BR');
          await page.goForward();
          await expect
            .poll(() => page.getByRole('link', { name: 'Voltar à busca' }).count())
            .toBe(1);
        });
        await attempt('LISTING-002', async (folder) => {
          for (const suffix of [104, 109]) {
            const expected = await readListing(base, preparedListingId(suffix)),
              parent = await readListingContext(base, expected);
            await writeFile(
              new URL(`fixtures/listing-${suffix}.json`, directory),
              JSON.stringify(expected, null, 2),
            );
            await page.goto(`${base}/listings/${expected.listing.id}`);
            await checkListing(page, expected, parent, 'pt-BR');
            if (suffix === 109) {
              expect(expected.listing.history.some((event) => event.type === 'removed')).toBe(true);
              expect(expected.listing.history.some((event) => event.type === 'reappeared')).toBe(
                true,
              );
            }
            await capture(page, `listing-${suffix}-history-390-pt-BR`, folder);
          }
        });
        await attempt('LISTING-003', async (folder) => {
          for (const suffix of [991, 992, 993]) {
            const expected = await readListing(base, preparedListingId(suffix)),
              parent = await readListingContext(base, expected);
            await writeFile(
              new URL(`fixtures/listing-${suffix}.json`, directory),
              JSON.stringify(expected, null, 2),
            );
            if (suffix === 991) expect(expected.listing.description.permission).toBe('denied');
            if (suffix === 992) expect(expected.listing.snapshot.availability).toBe('expired');
            if (suffix === 993) {
              expect(expected.listing.status).toBe('removed');
              expect(expected.listing.bedrooms).toBeNull();
            }
            for (const locale of ['pt-BR', 'en'] as const) {
              await page.evaluate(
                (language) => localStorage.setItem('rei.locale', language),
                locale,
              );
              await page.goto(`${base}/listings/${expected.listing.id}`);
              await checkListing(page, expected, parent, locale);
              await capture(page, `listing-${suffix}-390-${locale}`, folder);
            }
          }
          await page.evaluate(() => localStorage.setItem('rei.locale', 'pt-BR'));
        });
        await attempt('LISTING-004', async (folder) => {
          for (const id of ['bad-id', '0199a3e0-0000-4000-8000-000000000104']) {
            const before = reads.length;
            await page.goto(`${base}/listings/${id}`);
            await expect
              .poll(() => page.locator('main').textContent())
              .toContain('Identificador de anúncio inválido');
            expect(
              reads.slice(before).filter((path) => path.startsWith('/api/v1/listings/')),
            ).toEqual([]);
          }
          await page.goto(`${base}/listings/${preparedListingId(999)}`);
          await expect
            .poll(() => page.locator('main').textContent())
            .toContain('Anúncio não encontrado');
          await capture(page, 'listing-missing-390-pt-BR', folder);
          const pattern = `**/api/v1/listings/${canonical.listing.id}`;
          let intercepted = 0;
          await page.route(pattern, async (route) => {
            intercepted++;
            await route.fulfill({
              status: 503,
              headers: { 'x-request-id': preparedListingId(999) },
              body: 'private listing failure payload',
            });
          });
          await page.goto(`${base}/listings/${canonical.listing.id}`);
          await expect.poll(() => page.getByRole('alert').count()).toBe(1);
          expect(await page.locator('main').textContent()).not.toContain('private listing failure');
          expect(intercepted).toBe(1);
          await capture(page, 'listing-failed-390-pt-BR', folder);
          await page.unroute(pattern);
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await checkListing(page, canonical, property, 'pt-BR');
          await page.getByRole('link', { name: 'Voltar ao imóvel' }).click();
          // The Listing plate carries `.property-head` too. Wait for the Property plate itself:
          // going back before the Property page commits leaves the Listing mounted, so nothing
          // remounts and no stale refetch is observed.
          await expect
            .poll(() => page.locator('.property-head:not(.listing-head)').count())
            .toBe(1);
          const browserBefore = await page.evaluate(() => Date.now());
          await page.clock.setFixedTime(new Date(browserBefore + 31_000));
          const browserAfter = await page.evaluate(() => Date.now());
          expect(browserAfter - browserBefore).toBe(31_000);
          let staleRefetches = 0;
          await page.route(pattern, async (route) => {
            staleRefetches++;
            await route.fulfill({ status: 503, body: 'private retained Listing payload' });
          });
          await preserveCleanup(
            async () => {
              await page.goBack();
              await expect.poll(() => page.getByRole('alert').count()).toBe(1);
            },
            async () => {
              const receipt = 'listing-stale-refetch-clock.json';
              await writeFile(
                new URL(receipt, captures),
                JSON.stringify({ browserBefore, browserAfter, staleRefetches }, null, 2),
              );
              await copy(receipt, folder);
            },
          );
          expect(staleRefetches).toBe(1);
          expect(await page.locator('.listing-head h1').textContent()).toBe(
            canonical.listing.street,
          );
          expect(await page.locator('main').textContent()).not.toContain(
            'private retained Listing',
          );
          await capture(page, 'listing-retained-390-pt-BR', folder);
          await page.unroute(pattern);
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await checkListing(page, canonical, property, 'pt-BR');
          await page.route(pattern, async (route) => {
            await route.abort('failed');
          });
          await page.goto(`${base}/listings/${canonical.listing.id}`);
          await expect.poll(() => page.getByRole('alert').count()).toBe(1);
          await page.unroute(pattern);
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await checkListing(page, canonical, property, 'pt-BR');
          for (const query of [
            'returnTo=https%3A%2F%2Fevil.invalid',
            'returnTo=%2Fsearch%2Fa&returnTo=%2Fsearch%2Fb',
            'returnTo=%2Fsearch%2Fa%3Fview%3Dfilters',
          ]) {
            await page.goto(`${base}/listings/${canonical.listing.id}?${query}`);
            await checkListing(page, canonical, property, 'pt-BR');
            expect(
              await page.getByRole('link', { name: 'Voltar ao imóvel' }).getAttribute('href'),
            ).toBe(`/properties/${canonical.listing.propertyId}`);
          }
        });
        await attempt('LISTING-005', async (folder) => {
          const pattern = `**/api/v1/properties/${canonical.listing.propertyId}`;
          let stalledReads = 0;
          await page.route(pattern, () => {
            stalledReads++;
          });
          const cancelledRequest = page.waitForEvent('requestfailed', {
            predicate: (request) =>
              new URL(request.url()).pathname ===
              `/api/v1/properties/${canonical.listing.propertyId}`,
            timeout: 20_000,
          });
          const started = Date.now();
          await page.goto(`${base}/listings/${canonical.listing.id}`);
          await expect.poll(() => page.getByRole('alert').count(), { timeout: 20_000 }).toBe(1);
          const elapsedMs = Date.now() - started;
          const cancelled = await cancelledRequest;
          expect(stalledReads).toBe(1);
          expect(elapsedMs).toBeGreaterThanOrEqual(9_000);
          expect(elapsedMs).toBeLessThan(20_000);
          expect(cancelled.failure()?.errorText).toContain('ERR_ABORTED');
          expect(await page.locator('.listing-head h1').textContent()).toBe(
            canonical.listing.street,
          );
          expect(await page.locator('.listing-context').textContent()).toContain('não verificados');
          expect(await page.locator('.property-location').count()).toBe(0);
          expect(
            await page
              .locator('.public-tabs')
              .getByRole('link', { name: 'Buscar' })
              .getAttribute('href'),
          ).toBe('/search');
          await capture(page, 'listing-context-deadline-390-pt-BR', folder);
          const listingReadsBeforeRecovery = reads.filter(
            (path) => path === `/api/v1/listings/${canonical.listing.id}`,
          ).length;
          await page.unroute(pattern);
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await checkListing(page, canonical, property, 'pt-BR');
          expect(
            reads.filter((path) => path === `/api/v1/listings/${canonical.listing.id}`),
          ).toHaveLength(listingReadsBeforeRecovery);
          const deadlineReceipt = 'listing-context-deadline.json';
          await writeFile(
            new URL(deadlineReceipt, captures),
            JSON.stringify(
              {
                deadlineMs: 10_000,
                elapsedMs,
                stalledReads,
                cancelled: cancelled.failure()?.errorText,
                listingReadsBeforeRecovery,
                listingReadsAfterRecovery: reads.filter(
                  (path) => path === `/api/v1/listings/${canonical.listing.id}`,
                ).length,
                recoveredMembership: canonical.listing.id,
              },
              null,
              2,
            ),
          );
          await copy(deadlineReceipt, folder);
          for (const fault of ['failed', 'mismatch'] as const) {
            await page.route(pattern, async (route) => {
              await route.fulfill(
                fault === 'failed'
                  ? { status: 503, body: 'private Property context payload' }
                  : {
                      status: 200,
                      contentType: 'application/json',
                      body: JSON.stringify({
                        ...property,
                        property: {
                          ...property.property,
                          listings: property.property.listings.filter(
                            (listing) => listing.id !== canonical.listing.id,
                          ),
                        },
                      }),
                    },
              );
            });
            await page.goto(`${base}/listings/${canonical.listing.id}`);
            await expect.poll(() => page.getByRole('alert').count()).toBe(1);
            expect(await page.locator('.listing-head h1').textContent()).toBe(
              canonical.listing.street,
            );
            expect(await page.locator('.listing-context').textContent()).toContain(
              'não verificados',
            );
            expect(
              await page
                .locator('.public-tabs')
                .getByRole('link', { name: 'Buscar' })
                .getAttribute('href'),
            ).toBe('/search');
            expect(await page.locator('main').textContent()).not.toContain('private Property');
            await capture(page, `listing-context-${fault}-390-pt-BR`, folder);
            const listingReads = reads.filter(
              (path) => path === `/api/v1/listings/${canonical.listing.id}`,
            ).length;
            await page.unroute(pattern);
            await page.getByRole('button', { name: 'Tentar de novo' }).click();
            await checkListing(page, canonical, property, 'pt-BR');
            expect(
              reads.filter((path) => path === `/api/v1/listings/${canonical.listing.id}`),
            ).toHaveLength(listingReads);
          }
        });
        await attempt('LISTING-006', async (folder) => {
          for (const width of [390, 960, 1440])
            for (const locale of ['pt-BR', 'en'] as const) {
              const visual = await browser!.newContext({
                viewport: { width, height: width === 390 ? 1782 : 1207 },
                reducedMotion: 'reduce',
              });
              await preserveCleanup(
                async () => {
                  await visual.addInitScript(
                    (language) => localStorage.setItem('rei.locale', language),
                    locale,
                  );
                  const external: string[] = [],
                    mutations: string[] = [],
                    fonts: string[] = [];
                  await visual.route('**/*', async (route) => {
                    const request = route.request(),
                      url = new URL(request.url());
                    if (url.origin !== base) {
                      external.push(url.origin);
                      await route.abort();
                    } else if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
                      mutations.push(request.method());
                      await route.abort();
                    } else await route.continue();
                  });
                  const view = await visual.newPage();
                  view.on('response', (response) => {
                    if (response.ok() && response.url().endsWith('.woff2'))
                      fonts.push(response.url());
                  });
                  await view.goto(`${base}/listings/${canonical.listing.id}`);
                  await checkListing(view, canonical, property, locale);
                  expect(await view.locator('.listing-head').count()).toBe(1);
                  const completeTimes = view.locator('.listing-effective-times');
                  const timeSummary = completeTimes.locator('summary');
                  expect(await timeSummary.textContent()).toBe(
                    locale === 'en' ? 'View complete times (UTC)' : 'Ver horários completos (UTC)',
                  );
                  await timeSummary.focus();
                  await view.keyboard.press('Enter');
                  expect(await completeTimes.getAttribute('open')).not.toBeNull();
                  const expectedTimes = [
                    canonical.listing.fieldEffectiveAt.askingPrice,
                    ...Array<string>(6).fill(canonical.listing.fieldEffectiveAt.attributes),
                    canonical.listing.fieldEffectiveAt.description,
                  ];
                  const observedTimes = [];
                  expect(await completeTimes.locator('dt').count()).toBe(8);
                  expect(await completeTimes.locator('time').count()).toBe(8);
                  for (const [index, instant] of expectedTimes.entries()) {
                    const time = completeTimes.locator('time').nth(index);
                    expect(await time.isVisible()).toBe(true);
                    expect(await time.getAttribute('datetime')).toBe(instant);
                    expect(await time.textContent()).toBe(listingDate(instant, locale));
                    observedTimes.push({
                      field: await completeTimes.locator('dt').nth(index).textContent(),
                      instant,
                      text: await time.textContent(),
                    });
                  }
                  await checkAccessibility(view, `listing-times-open-${width}-${locale}`);
                  const timesName = `listing-104-${width}-${locale}-complete-times`;
                  await view.locator('.listing-values').screenshot({
                    path: new URL(`${timesName}.png`, captures).pathname,
                  });
                  await copy(`${timesName}.png`, folder);
                  await writeFile(
                    new URL(`${timesName}.json`, captures),
                    JSON.stringify(
                      { version, locale, width, keyboardOpened: true, observedTimes },
                      null,
                      2,
                    ),
                  );
                  await copy(`${timesName}.json`, folder);
                  await timeSummary.click();
                  expect(await completeTimes.getAttribute('open')).toBeNull();
                  const metadata = view.locator('.listing-provenance details');
                  const metadataSummary = metadata.locator('summary');
                  await metadataSummary.focus();
                  await view.keyboard.press('Enter');
                  expect(await metadata.getAttribute('open')).not.toBeNull();
                  const evidenceLabel = metadata
                    .locator('dt')
                    .filter({
                      hasText:
                        locale === 'en'
                          ? 'Synthetic evidence label'
                          : 'Identificação da evidência sintética',
                    })
                    .locator('+ dd');
                  expect(await evidenceLabel.isVisible()).toBe(true);
                  expect(await evidenceLabel.textContent()).toBe(
                    displayedEvidenceLabel(canonical.listing.fixtureLabel, locale),
                  );
                  const metadataLayout = await metadata
                    .locator('.listing-publication-identifiers')
                    .evaluate((list) => {
                      const values = Array.from(list.querySelectorAll('dd')).map((value) => {
                        const text = value.firstChild;
                        if (!(text instanceof Text)) throw new Error('Expected metadata text');
                        const lines = new Map<number, number>();
                        const range = document.createRange();
                        for (let index = 0; index < text.length; index++) {
                          range.setStart(text, index);
                          range.setEnd(text, index + 1);
                          const top = range.getBoundingClientRect().top;
                          lines.set(top, (lines.get(top) ?? 0) + 1);
                        }
                        return {
                          text: value.textContent,
                          width: value.getBoundingClientRect().width,
                          lineCharacterCounts: Array.from(lines.values()),
                        };
                      });
                      return { width: list.getBoundingClientRect().width, values };
                    });
                  expect(metadataLayout.values.map((value) => value.text)).toEqual([
                    canonical.listing.id,
                    displayedEvidenceLabel(canonical.listing.fixtureLabel, locale),
                  ]);
                  for (const value of metadataLayout.values) {
                    expect(value.width / metadataLayout.width).toBeGreaterThanOrEqual(0.55);
                    expect(value.lineCharacterCounts.length).toBeLessThanOrEqual(3);
                    expect(value.lineCharacterCounts.at(-1)).toBeGreaterThan(1);
                  }
                  await checkAccessibility(view, `listing-metadata-open-${width}-${locale}`);
                  const metadataName = `listing-104-${width}-${locale}-metadata`;
                  await view.locator('.listing-provenance').screenshot({
                    path: new URL(`${metadataName}.png`, captures).pathname,
                  });
                  await copy(`${metadataName}.png`, folder);
                  await writeFile(
                    new URL(`${metadataName}.json`, captures),
                    JSON.stringify(
                      {
                        version,
                        locale,
                        width,
                        keyboardOpened: true,
                        expectedFixtureLabel: displayedEvidenceLabel(
                          canonical.listing.fixtureLabel,
                          locale,
                        ),
                        observedFixtureLabel: await evidenceLabel.textContent(),
                        metadataLayout,
                        caveat: await metadata.locator(':scope > .prov').textContent(),
                      },
                      null,
                      2,
                    ),
                  );
                  await copy(`${metadataName}.json`, folder);
                  await metadataSummary.click();
                  expect(await metadata.getAttribute('open')).toBeNull();
                  const summary = view.locator('.listing-comparison > summary');
                  await summary.focus();
                  expect(
                    await summary.evaluate((element) => ({
                      focused: document.activeElement === element,
                      outline: getComputedStyle(element).outlineStyle,
                    })),
                  ).toEqual({ focused: true, outline: 'solid' });
                  await view.keyboard.press('Enter');
                  expect(
                    await view.locator('.listing-comparison').getAttribute('open'),
                  ).not.toBeNull();
                  await checkAccessibility(view, `listing-open-${width}-${locale}`);
                  await view.keyboard.press('Enter');
                  await capture(view, `listing-104-${width}-${locale}`, folder);
                  expect(fonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                  expect(fonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(
                    true,
                  );
                  expect(external).toEqual([]);
                  expect(mutations).toEqual([]);
                },
                () => visual.close(),
              );
            }
          return { finalUiFile: 'listing-104-1440-en-top.png' };
        });
        await attempt('LISTING-007', async (folder) => {
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
                        await requestHttp(
                          `${referenceBase}/test-fixtures/artboards/Listing.dc.html`,
                        )
                      ).status;
                    } catch {
                      return 0;
                    }
                  },
                  { timeout: 30000, interval: 200 },
                )
                .toBe(200);
              const visual = await browser!.newContext({ viewport: { width: 390, height: 1782 } });
              await preserveCleanup(
                async () => {
                  const external: string[] = [];
                  await visual.route('**/*', async (route) => {
                    if (new URL(route.request().url()).origin !== referenceBase) {
                      external.push(route.request().url());
                      await route.abort();
                    } else await route.continue();
                  });
                  const view = await visual.newPage();
                  await view.goto(`${referenceBase}/test-fixtures/artboards/Listing.dc.html`);
                  const captureStart = await settlePropertyCaptureStart(view);
                  const bounds = await view.locator('.rei.stack').boundingBox();
                  expect(bounds?.width).toBe(390);
                  expect(bounds?.height).toBe(1782);
                  const name = 'listing-reference-390x1782.png';
                  await view.screenshot({ path: new URL(name, captures).pathname });
                  await copy(name, folder);
                  expect(
                    await view.evaluate(() => document.fonts.check('600 24px "Barlow Condensed"')),
                  ).toBe(true);
                  expect(external).toEqual([]);
                  await writeFile(
                    new URL('reference.json', folder),
                    JSON.stringify(
                      {
                        file: 'Listing.dc.html',
                        width: 390,
                        height: 1782,
                        captureStart,
                        sourceHash: createHash('sha256')
                          .update(
                            await readFile(
                              new URL(
                                '../docs/design/canvas/project/Listing.dc.html',
                                import.meta.url,
                              ),
                            ),
                          )
                          .digest('hex'),
                        version,
                        external,
                      },
                      null,
                      2,
                    ),
                  );
                },
                () => visual.close(),
              );
            },
            async () => {
              server.kill('SIGTERM');
              const stopped = await server;
              expect(stopped.exitCode === 0 || stopped.signal === 'SIGTERM').toBe(true);
            },
          );
          return { finalUiFile: 'listing-reference-390x1782.png' };
        });
        expect(outside).toEqual([]);
        expect(writes).toEqual([]);
        await context.close();
      });
    },
    campaign,
    async () => {
      await browser?.close();
    },
    async () => {
      const owned: Array<{ kind: string; output: string }> = [];
      for (const [kind, args] of [
        ['containers', ['ps', '--all', '--format', '{{.ID}}']],
        ['volumes', ['volume', 'ls', '--format', '{{.Name}}']],
        ['networks', ['network', 'ls', '--format', '{{.ID}}']],
      ] as const) {
        const output = (
          await execa(
            'docker',
            [...args, '--filter', `label=com.docker.compose.project=${project}`],
            { timeout: 30000 },
          )
        ).stdout.trim();
        owned.push({ kind, output });
        expect(output).toBe('');
      }
      const remaining = await inventory();
      expect(foreignBaseline.containers.every((id) => remaining.containers.includes(id))).toBe(
        true,
      );
      expect(foreignBaseline.volumes.every((name) => remaining.volumes.includes(name))).toBe(true);
      campaign.stackTornDownUtc = new Date().toISOString();
      await writeFile(
        new URL('teardown.json', directory),
        JSON.stringify(
          { project, verifiedUtc: campaign.stackTornDownUtc, owned, foreignBaseline, remaining },
          null,
          2,
        ),
      );
    },
    () => writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2)),
    () =>
      writeFile(
        new URL('results/report.md', directory),
        `# Listing browser campaign\n\nRun ${runId}; status ${campaign.status}; ${attempts} semantic scenarios attempted. Consult append-only attempts and independent parsed fixtures.\n\nSource ${version.listingSourceHash}; web artifact ${version.webArtifactHash}; base ${commit} with dirty local implementation. Immutable surface bytes and hashes live in surfaces.json.\n\nReproduce: pnpm exec vitest run --config vitest.integration.config.ts integration/web-listing.integration.test.ts\n\nOwned teardown: ${campaign.stackTornDownUtc ?? 'not confirmed'}. Prepared reads do not establish persisted correction/revocation/expiry; the existing listing-provenance campaign remains necessary. Parent authored-artboard comparison, detector, finish review/documenter and human screen-reader/daylight/zoom review remain separate.\n`,
      ),
  );
  console.info('Listing campaign evidence', directory.pathname);
});
