import { mkdir, writeFile, appendFile, readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { expect, test } from 'vitest';
import { allocatePorts, withCampaign, preserveCleanup } from './support/fixture.ts';
import { copySurfaceEvidence, runSearchCampaign } from './support/search-campaign.ts';
import { requestHttp } from './support/http.ts';
import { checkAccessibility } from './support/accessibility.ts';
import { preparedPropertyId, readProperty, checkProperty } from './support/property-reads.ts';
import { settlePropertyCaptureStart } from './support/property-capture.ts';

const scenarios = [
  [
    'PROPERTY-001',
    'Complete three-listing evidence',
    'A prepared Bela Vista property with three source listings, nine reasons and two dated reductions.',
    'Open the actual Property detail from filtered Search.',
    'Every price, source, event, interval, reason and feature is consistent with the parsed real API, and no Sale or unavailable image is fabricated.',
  ],
  [
    'PROPERTY-002',
    'Exact Search return and draft-only Ask',
    'An applied internal Search URL with explicit false and ordering.',
    'Open its native Property row, return, then follow Ask from detail.',
    'The exact Search URL survives and Ask receives a labelled escaped unexecuted draft only in state; no mutation or question URL/storage occurs.',
  ],
  [
    'PROPERTY-003',
    'Actual neighborhood and removed return gap',
    'The prepared Vila Mariana property with a Cobalto removed/reappeared interval.',
    'Open detail directly and disclose source chronology.',
    'Shell links use Vila Mariana, Search is current, all bars/ticks/labels share a date scale, and the April–June gap is dashed without a sold inference.',
  ],
  [
    'PROPERTY-004',
    'Permission, expiry and no-active boundaries',
    'Prepared supplementary properties 901, 902 and 903.',
    'Read descriptions, safe metadata and retained removed history.',
    'Denied text is absent; expired hashes/dates remain accessible; null Asking/rooms remain unknown and zero active does not erase history.',
  ],
  [
    'PROPERTY-005',
    'Identity and safe manual failure recovery',
    'Malformed/v4 identities, an absent v7 identity, and a bounded injected HTTP failure.',
    'Open each state, manually retry the real detail, then return through history with a stale cache and a bounded refetch fault.',
    'Invalid identities cause no detail read, unknown context stays neutral, 404/errors expose no private body, known detail survives refetch failure, and manual retry reaches the real API without automatic retry.',
  ],
  [
    'PROPERTY-006',
    'Both locales and all responsive breakpoints',
    'The complete Property detail and local Placa fonts.',
    'Render PT/EN at 390, 960 and 1440, keyboard-toggle evidence, inspect target geometry and scan the full page.',
    'No external/write request or horizontal overflow occurs, every visible control is at least 44px in both dimensions, visible keyboard focus works, and full-page axe reports no violations.',
  ],
  [
    'PROPERTY-007',
    'Authored references remain reproducible',
    'The existing Property and DesktopProperty artboards, not altered by implementation.',
    'Render the dev-only fixed reference entries at 390×1842 and 1440×1207.',
    'Both authored reference captures use local fonts, preserve authored dimensions and are source-hashed for the parent’s separate visual comparison.',
  ],
].map(([id, title, given, when, then]) => ({
  id: id!,
  title: title!,
  given: given!,
  when: when!,
  then: then!,
  area: 'Property',
  persona: 'public visitor',
  journey: title!,
  dependencies: [],
  verification: {
    oracle: 'Story 6.7 / D-060 / D-061 plus independently parsed owned public API.',
    method:
      'Real Supertest HTTP readback and sandboxed Chromium; prepared reads do not prove persisted unresolved membership.',
  },
}));

test('Property follows the complete public contract through owned real HTTP and Chromium', async () => {
  const runId = `property-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = new URL(`../apps/web/.impeccable/review/campaigns/${runId}/`, import.meta.url);
  const captures = new URL('../apps/web/.impeccable/review/', import.meta.url);
  for (const folder of ['catalog/', 'results/', 'evidence/', 'fixtures/'])
    await mkdir(new URL(folder, directory), { recursive: true });
  await mkdir(captures, { recursive: true });
  await writeFile(
    new URL('catalog/scenarios.json', directory),
    JSON.stringify({ scenarios }, null, 2),
  );
  await writeFile(
    new URL('catalog/property.feature', directory),
    scenarios
      .map(
        (s) =>
          `Scenario: ${s.id} ${s.title}\n  Given ${s.given}\n  When ${s.when}\n  Then ${s.then}`,
      )
      .join('\n\n'),
  );
  const project = `rei-web-property-${randomUUID()}`;
  const [postgres, api, web, reference] = await allocatePorts(4);
  const base = `http://127.0.0.1:${web}`;
  const referenceBase = `http://127.0.0.1:${reference}`;
  const campaign = {
    runId,
    status: 'running',
    scope: 'Story 6.7 complete prepared Property read-only production-stack campaign',
    exclusions: [
      'Persisted unresolved membership: isolated parser-validated component regression, not prepared API proof',
      'Live sources/models, production/VPS, protected Operations/Listing and V2 actions',
      'Parent finite visual comparison, detector and independent finish acceptance',
    ],
    targetUrls: [base, referenceBase],
    personas: ['public visitor'],
    dataOwnership: project,
    allowedSideEffects: [
      'Own Compose containers/network/volumes',
      'Own Vite reference process',
      'Local test evidence',
    ],
    completionCriteria:
      'Seven distinct semantic scenarios, six complete locale/viewport surfaces, explicit boundary captures, authored references and owned teardown',
    stackTornDownUtc: null as string | null,
  };
  const head = (await readFile(new URL('../.git/HEAD', import.meta.url), 'utf8')).trim();
  const commit = head.startsWith('ref: ')
    ? (await readFile(new URL(`../.git/${head.slice(5)}`, import.meta.url), 'utf8')).trim()
    : head;
  const assetHash = createHash('sha256');
  const assets = new URL('../apps/web/dist/assets/', import.meta.url);
  for (const name of (await readdir(assets)).filter((name) => /\.(js|css)$/.test(name)).sort())
    assetHash.update(name).update(await readFile(new URL(name, assets)));
  const sourceHash = createHash('sha256');
  const sources = new URL('../apps/web/src/properties/', import.meta.url);
  for (const name of (await readdir(sources))
    .filter((name) => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'))
    .sort())
    sourceHash.update(name).update(await readFile(new URL(name, sources)));
  sourceHash.update(
    await readFile(new URL('../apps/web/src/styles/property.css', import.meta.url)),
  );
  const version = {
    commit,
    dirty: true,
    webArtifactHash: assetHash.digest('hex'),
    propertySourceHash: sourceHash.digest('hex'),
    backendArtifactHash: createHash('sha256')
      .update(await readFile(new URL('../apps/api/dist/main.js', import.meta.url)))
      .digest('hex'),
    artifactScope:
      'Local production build and owned production images, not a production release identity',
    project,
    observedUtc: new Date().toISOString(),
  };
  await writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2));
  await writeFile(
    new URL('inventory.json', directory),
    JSON.stringify(
      {
        owner: project,
        publicIds: [1, 4, 901, 902, 903].map(preparedPropertyId),
        preparation:
          'Repository-owned migrations and prepared synthetic adapter; no acquisition/membership mutation.',
        unresolved:
          'Parser-validated isolated component regression only; not an actual persisted read.',
      },
      null,
      2,
    ),
  );
  const env = {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: '1',
    COMPOSE_ENV_FILES: '',
    NODE_ENV: 'test',
    POSTGRES_DB: 'rei_web_property',
    POSTGRES_USER: 'rei_web_property',
    POSTGRES_PASSWORD: 'controlled-property-fixture',
    POSTGRES_PORT: String(postgres),
    API_PORT: String(api),
    WEB_PORT: String(web),
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  const browserEnv = { ...process.env };
  delete browserEnv.DISPLAY;
  let browser: Browser | undefined;
  let attempts = 0;
  const manifest: Array<{ file: string; hash: string; evidencePath: string }> = [];
  const foreignBaseline = {
    containers: (
      await execa('docker', ['ps', '--all', '--format', '{{.ID}}'], { timeout: 30000 })
    ).stdout
      .split('\n')
      .filter(Boolean),
    volumes: (
      await execa('docker', ['volume', 'ls', '--format', '{{.Name}}'], { timeout: 30000 })
    ).stdout
      .split('\n')
      .filter(Boolean),
  };
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
          viewport: { width: 390, height: 1842 },
          reducedMotion: 'reduce',
        });
        await context.addInitScript(() => localStorage.setItem('rei.locale', 'pt-BR'));
        const outside: string[] = [],
          forbidden: string[] = [],
          reads: string[] = [];
        await context.route('**/*', async (route) => {
          const request = route.request(),
            url = new URL(request.url());
          if (url.origin !== base) {
            outside.push(url.origin);
            await route.abort();
          } else if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
            forbidden.push(`${request.method()} ${url.pathname}`);
            await route.abort();
          } else {
            if (url.pathname.startsWith('/api/')) reads.push(url.pathname + url.search);
            await route.continue();
          }
        });
        const page = await context.newPage();
        async function attempt(id: string, action: (folder: URL) => Promise<unknown>) {
          const startedUtc = new Date().toISOString(),
            attemptId = `${id}-${++attempts}`,
            folder = new URL(`evidence/${attemptId}/`, directory);
          await mkdir(folder, { recursive: true });
          let failure: unknown;
          try {
            await action(folder);
          } catch (error) {
            failure = error;
          }
          await page.screenshot({
            path: new URL('final.png', folder).pathname,
            fullPage: true,
            mask: [page.locator('.place-draft > p').first()],
          });
          await writeFile(
            new URL('environment.json', folder),
            JSON.stringify({ version }, null, 2),
          );
          await writeFile(
            new URL('readback.json', folder),
            JSON.stringify(
              {
                url: page.url(),
                reads,
                outside,
                forbidden,
                body: await page.locator('body').evaluate((body) => {
                  const copy = body.cloneNode(true) as HTMLElement;
                  const draft = copy.querySelector('.place-draft > p');
                  if (draft)
                    draft.textContent =
                      '[Draft content redacted; unexecuted state-only handoff asserted.]';
                  return copy.textContent?.slice(0, 20000);
                }),
                failure: failure instanceof Error ? failure.message : null,
              },
              null,
              2,
            ),
          );
          await appendFile(
            new URL('results/attempts.jsonl', directory),
            JSON.stringify({
              attemptId,
              scenarioId: id,
              kind: 'scenario',
              status: failure ? 'failed' : 'approved',
              executorError: false,
              failureClassification: failure
                ? 'Untriaged assertion failure; not automatically an executor-only defect.'
                : null,
              reason:
                failure instanceof Error
                  ? failure.message
                  : 'Declared independently specified real HTTP/UI checks passed.',
              startedUtc,
              finishedUtc: new Date().toISOString(),
              environmentEvidence: `evidence/${attemptId}/environment.json`,
              finalUiEvidence: `evidence/${attemptId}/final.png`,
              evidence: [
                `evidence/${attemptId}/readback.json`,
                ...(manifest.length ? ['surfaces.json'] : []),
              ],
              verification: {
                expected: scenarios.find((s) => s.id === id)?.then,
                observed: failure
                  ? 'Recorded assertion failure'
                  : 'All declared real HTTP/native browser assertions passed',
                comparison:
                  'Parsed public values, explicit contract limitations and independently authored journey requirements compared before verdict.',
              },
            }) + '\n',
          );
          if (failure) throw failure;
        }
        async function capture(view: Page, name: string, folder: URL) {
          const fullPageStart = await settlePropertyCaptureStart(view);
          await view.screenshot({
            path: new URL(`${name}.png`, captures).pathname,
            fullPage: true,
          });
          const viewportStart = await settlePropertyCaptureStart(view);
          await view.screenshot({
            path: new URL(`${name}-top.png`, captures).pathname,
            fullPage: false,
          });
          const axe = await checkAccessibility(view, name);
          const geometry = await view.evaluate(() => ({
            width: innerWidth,
            documentHeight: document.documentElement.scrollHeight,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
            targets: Array.from(
              document.querySelectorAll<HTMLElement>('a, button, summary, input, select'),
            )
              .filter((element) => element.getClientRects().length > 0)
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  label: element.textContent?.trim(),
                  width: rect.width,
                  height: rect.height,
                };
              }),
            fonts: {
              heading: document.querySelector('h1')
                ? getComputedStyle(document.querySelector('h1')!).fontFamily
                : null,
              content: document.querySelector('.property-summary p, .rei main p, .rei p')
                ? getComputedStyle(
                    document.querySelector('.property-summary p, .rei main p, .rei p')!,
                  ).fontFamily
                : null,
              barlowLoaded: document.fonts.check('400 14px Barlow'),
              barlowCondensedLoaded: document.fonts.check('600 24px "Barlow Condensed"'),
            },
          }));
          expect(geometry.horizontalOverflow).toBe(false);
          expect(geometry.fonts.content).toContain('Barlow');
          expect(geometry.fonts.barlowLoaded).toBe(true);
          expect(geometry.fonts.barlowCondensedLoaded).toBe(true);
          expect(
            geometry.targets.filter((target) => target.width < 44 || target.height < 44),
          ).toEqual([]);
          await writeFile(
            new URL(`${name}-interaction.json`, captures),
            JSON.stringify(
              {
                url: view.url(),
                version,
                ...geometry,
                captureStart: { fullPage: fullPageStart, viewport: viewportStart },
                axeIncomplete: axe.incomplete,
                manual: [
                  'Screen-reader pronunciation/reading order, daylight focus and zoom require parent/human assessment',
                ],
              },
              null,
              2,
            ),
          );
          const suffixes = ['.png', '-top.png', '-accessibility.json', '-interaction.json'];
          if (geometry.documentHeight > 2400) {
            for (const [region, selector] of [
              ['evidence', '.property-pair--evidence'],
              ['sources', '.property-pair:last-child'],
            ] as const) {
              if (await view.locator(selector).count()) {
                await view
                  .locator(selector)
                  .screenshot({ path: new URL(`${name}-region-${region}.png`, captures).pathname });
                suffixes.push(`-region-${region}.png`);
              }
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
            JSON.stringify(
              {
                version,
                files: manifest,
                immutableCopies:
                  'Each file also resides under its scenario evidence directory; copied bytes were formatted before hashing.',
              },
              null,
              2,
            ),
          );
        }
        const canonical = await readProperty(base, preparedPropertyId(1));
        await writeFile(
          new URL('fixtures/property-001.json', directory),
          JSON.stringify(canonical, null, 2),
        );
        const applied = '/search/sao-paulo-bela-vista?sort=most-recent&returnedToMarket=false';
        await attempt('PROPERTY-001', async () => {
          expect(canonical.property.listings).toHaveLength(3);
          expect(canonical.property.preparedEvidence.reasons).toHaveLength(9);
          expect(canonical.property.priceChanges).toHaveLength(2);
          expect(canonical.property.summary.askingPrice?.minorUnits).toBe(78000000);
          expect(canonical.property.summary.pricePerSquareMeter).toBe(951220);
          await page.goto(`${base}/search/sao-paulo-bela-vista`);
          await expect
            .poll(() => page.locator(`a.prow[href*="${preparedPropertyId(1)}"]`).count())
            .toBe(1);
          expect(
            reads.filter((path) => path === `/api/v1/properties/${preparedPropertyId(1)}`),
          ).toEqual([]);
          await page.locator(`a.prow[href*="${preparedPropertyId(1)}"]`).click();
          await checkProperty(page, canonical, 'pt-BR');
          expect(
            reads.filter((path) => path === `/api/v1/properties/${preparedPropertyId(1)}`),
          ).toHaveLength(1);
          expect(await page.locator('.property-evidence').textContent()).toContain('0,95');
          for (const value of canonical.property.sourceAgreement.find(
            (row) => row.field === 'neighborhood',
          )!.values) {
            const source = canonical.property.listings.find(
              (listing) => listing.id === value.listingId,
            )!;
            expect(await page.locator('.property-features').textContent()).toContain(
              `${source.source.label}: ${value.value}`,
            );
          }
        });
        await attempt('PROPERTY-002', async () => {
          await page.goto(`${base}${applied}`);
          await expect
            .poll(() => page.locator(`a.prow[href*="${preparedPropertyId(1)}"]`).count())
            .toBe(1);
          await page.locator(`a.prow[href*="${preparedPropertyId(1)}"]`).click();
          await checkProperty(page, canonical, 'pt-BR');
          expect(
            await page.getByRole('link', { name: 'Voltar à busca' }).getAttribute('href'),
          ).toBe(applied);
          await page.getByRole('link', { name: 'Voltar à busca' }).click();
          expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(applied);
          await page.locator(`a.prow[href*="${preparedPropertyId(1)}"]`).click();
          await checkProperty(page, canonical, 'pt-BR');
          await page.getByRole('link', { name: 'Perguntar sobre este imóvel' }).focus();
          await page.keyboard.press('Enter');
          await expect
            .poll(() => page.locator('main').textContent())
            .toContain('Quero entender o histórico');
          expect(new URL(page.url()).pathname).toBe('/ask/sao-paulo-bela-vista');
          expect(new URL(page.url()).search).toBe('');
          expect(await page.evaluate(() => Object.values(localStorage))).toEqual(['pt-BR']);
          expect(await page.locator('main').textContent()).toContain(
            'não foi enviada nem executada',
          );
          expect(forbidden).toEqual([]);
        });
        await attempt('PROPERTY-003', async (folder) => {
          const returned = await readProperty(base, preparedPropertyId(4));
          await page.goto(`${base}/properties/${preparedPropertyId(4)}`);
          await checkProperty(page, returned, 'pt-BR');
          expect(
            await page
              .locator('.public-tabs')
              .getByRole('link', { name: 'Buscar' })
              .getAttribute('href'),
          ).toBe('/search/sao-paulo-vila-mariana');
          expect(
            await page
              .locator('.public-tabs')
              .getByRole('link', { name: 'Buscar' })
              .getAttribute('aria-current'),
          ).toBe('page');
          expect(await page.locator('.life__bar--off').count()).toBeGreaterThan(0);
          const gap = returned.property.listings.find((listing) =>
            listing.source.label.includes('Cobalto'),
          )!.lifeline;
          expect(gap[0]?.to).toContain('2026-04');
          expect(gap[1]?.from).toContain('2026-06');
          await page.getByText('Cronologia por fonte', { exact: true }).focus();
          await page.keyboard.press('Enter');
          expect(
            await page.locator('.property-lifelines details').getAttribute('open'),
          ).not.toBeNull();
          expect(await page.locator('.property-lifelines').textContent()).toContain(
            'Removido não significa vendido',
          );
          await capture(page, 'property-004-390-pt-BR', folder);
        });
        await attempt('PROPERTY-004', async (folder) => {
          for (const suffix of [901, 902, 903]) {
            const detail = await readProperty(base, preparedPropertyId(suffix));
            await page.goto(`${base}/properties/${preparedPropertyId(suffix)}`);
            await checkProperty(page, detail, 'pt-BR');
            if (suffix === 901) {
              const denied = detail.property.listings.filter(
                (listing) => listing.description.permission === 'denied',
              );
              expect(denied.length).toBeGreaterThan(0);
              for (const listing of denied) {
                const source = page.locator(`#property-listing-${listing.id}`);
                await page
                  .locator('.property-source-disclosure')
                  .filter({ has: source })
                  .locator(':scope > summary')
                  .click();
                await source.getByText('Datas de mudança da descrição').click();
                expect(await source.textContent()).toContain('não permite exibir');
                expect(
                  await source
                    .locator('summary')
                    .filter({ hasText: 'Descrição permitida pela fonte' })
                    .count(),
                ).toBe(0);
              }
            }
            if (suffix === 902) {
              const expired = detail.property.listings.find(
                (listing) => listing.snapshot.availability === 'expired',
              )!;
              expect(expired).toBeDefined();
              const source = page.locator(`#property-listing-${expired.id}`);
              await page
                .locator('.property-source-disclosure')
                .filter({ has: source })
                .locator(':scope > summary')
                .click();
              await source.getByText('Metadados seguros').click();
              expect(await source.textContent()).toContain(expired.provenance.contentHash);
              expect(await source.textContent()).toContain('Expirado');
            }
            if (suffix === 903) {
              expect(detail.property.summary.activeListingCount).toBe(0);
              expect(detail.property.summary.bedrooms).toBeNull();
              expect(await page.locator('.property-prices').textContent()).toContain(
                '0 anúncios ativos',
              );
              expect(await page.locator('.property-head').textContent()).toContain('Não informado');
              expect(await page.locator('.life__bar--off').count()).toBeGreaterThan(0);
            }
            await capture(page, `property-${suffix}-390-pt-BR`, folder);
          }
        });
        await attempt('PROPERTY-005', async (folder) => {
          for (const id of ['bad-id', '0199a3e0-0000-4000-8000-000000000001']) {
            const before = reads.length;
            await page.goto(`${base}/properties/${id}`);
            await expect
              .poll(() => page.locator('[role="alert"]').textContent())
              .toContain('Identificador de imóvel inválido');
            expect(
              reads.slice(before).filter((path) => path.startsWith('/api/v1/properties/')),
            ).toEqual([]);
            expect(
              await page
                .locator('.public-tabs')
                .getByRole('link', { name: 'Buscar' })
                .getAttribute('href'),
            ).toBe('/search');
          }
          await page.goto(`${base}/properties/${preparedPropertyId(999)}`);
          await expect
            .poll(() => page.locator('main').textContent())
            .toContain('Imóvel não encontrado');
          await capture(page, 'property-missing-390-pt-BR', folder);
          let intercepted = 0;
          await page.route(`**/api/v1/properties/${preparedPropertyId(1)}`, async (route) => {
            intercepted++;
            await route.fulfill({
              status: 503,
              headers: { 'x-request-id': preparedPropertyId(999) },
              body: 'private exception payload',
            });
          });
          await page.goto(`${base}/properties/${preparedPropertyId(1)}`);
          await expect.poll(() => page.getByRole('alert').count()).toBe(1);
          expect(await page.locator('main').textContent()).not.toContain(
            'private exception payload',
          );
          expect(intercepted).toBe(1);
          await capture(page, 'property-failed-390-pt-BR', folder);
          await page.unroute(`**/api/v1/properties/${preparedPropertyId(1)}`);
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await checkProperty(page, canonical, 'pt-BR');
          await page.getByRole('link', { name: 'Perguntar sobre este imóvel' }).click();
          await expect.poll(() => page.locator('.place-draft').count()).toBe(1);
          // Only Date changes: real timers/network remain active. The cache is genuinely stale
          // on browser-history remount, exercising real retained-data refetch without a test API.
          await page.clock.setFixedTime(new Date(Date.now() + 31_000));
          await page.route(`**/api/v1/properties/${preparedPropertyId(1)}`, async (route) => {
            await route.fulfill({ status: 503, body: 'private stale-refetch payload' });
          });
          await page.goBack();
          await expect.poll(() => page.getByRole('alert').count()).toBe(1);
          expect(await page.locator('.property-head h1').textContent()).toBe(
            canonical.property.listings[0]!.street,
          );
          expect(await page.locator('main').textContent()).not.toContain(
            'private stale-refetch payload',
          );
          await page.unroute(`**/api/v1/properties/${preparedPropertyId(1)}`);
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await checkProperty(page, canonical, 'pt-BR');
          await expect.poll(() => page.getByRole('alert').count()).toBe(0);
          await page.goto(
            `${base}/properties/${preparedPropertyId(1)}?returnTo=${encodeURIComponent('https://evil.invalid/')}`,
          );
          await checkProperty(page, canonical, 'pt-BR');
          expect(
            await page.getByRole('link', { name: 'Voltar à busca' }).getAttribute('href'),
          ).toBe('/search/sao-paulo-bela-vista');
        });
        await attempt('PROPERTY-006', async (folder) => {
          for (const width of [390, 960, 1440])
            for (const locale of ['pt-BR', 'en'] as const) {
              const visual = await browser!.newContext({
                viewport: { width, height: width === 390 ? 1842 : 1207 },
                reducedMotion: 'reduce',
              });
              await preserveCleanup(
                async () => {
                  await visual.addInitScript(
                    (language) => localStorage.setItem('rei.locale', language),
                    locale,
                  );
                  const fonts: string[] = [],
                    external: string[] = [],
                    writes: string[] = [];
                  await visual.route('**/*', async (route) => {
                    const request = route.request(),
                      url = new URL(request.url());
                    if (url.origin !== base) {
                      external.push(url.origin);
                      await route.abort();
                    } else if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
                      writes.push(request.method());
                      await route.abort();
                    } else await route.continue();
                  });
                  const view = await visual.newPage();
                  view.on('response', (response) => {
                    if (response.ok() && response.url().endsWith('.woff2'))
                      fonts.push(response.url());
                  });
                  await view.goto(`${base}/properties/${preparedPropertyId(1)}`);
                  await checkProperty(view, canonical, locale);
                  const disclosure = view.locator('.property-provenance summary').first();
                  await disclosure.focus();
                  expect(
                    await disclosure.evaluate((element) => ({
                      focused: document.activeElement === element,
                      outline: getComputedStyle(element).outlineStyle,
                    })),
                  ).toEqual({ focused: true, outline: 'solid' });
                  await view.keyboard.press('Enter');
                  expect(
                    await view.locator('.property-provenance details').first().getAttribute('open'),
                  ).not.toBeNull();
                  await view.keyboard.press('Enter');
                  const priceSource = view.locator('.property-price-provenance a');
                  await priceSource.focus();
                  await view.keyboard.press('Enter');
                  const source = view.locator(
                    `#property-listing-${canonical.property.summary.askingPrice!.listingId}`,
                  );
                  expect(await source.isVisible()).toBe(true);
                  expect(
                    await source.evaluate((element) => document.activeElement === element),
                  ).toBe(true);
                  const metadata = source
                    .locator('summary')
                    .filter({ hasText: locale === 'en' ? 'Safe metadata' : 'Metadados seguros' });
                  await metadata.click();
                  expect(await source.locator('details[open]').textContent()).toContain(
                    canonical.property.listings[0]!.provenance.contentHash,
                  );
                  await metadata.click();
                  await view
                    .locator('.property-source-disclosure')
                    .filter({ has: source })
                    .locator(':scope > summary')
                    .click();
                  expect(await view.locator('.property-reasons > li').count()).toBe(9);
                  expect(await view.locator('.property-reasons details').count()).toBe(0);
                  expect(await view.locator('.property-feature-list details').count()).toBe(0);
                  expect(await view.locator('.property-source-disclosure[open]').count()).toBe(0);
                  await capture(view, `property-001-${width}-${locale}`, folder);
                  expect(fonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                  expect(fonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(
                    true,
                  );
                  expect(external).toEqual([]);
                  expect(writes).toEqual([]);
                },
                () => visual.close(),
              );
            }
        });
        await attempt('PROPERTY-007', async (folder) => {
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
                          `${referenceBase}/test-fixtures/artboards/Property.dc.html`,
                        )
                      ).status;
                    } catch {
                      return 0;
                    }
                  },
                  { timeout: 30000, interval: 200 },
                )
                .toBe(200);
              for (const [file, width, height] of [
                ['Property.dc.html', 390, 1842],
                ['DesktopProperty.dc.html', 1440, 1207],
              ] as const) {
                const referenceContext = await browser!.newContext({
                  viewport: { width, height },
                  reducedMotion: 'reduce',
                });
                await preserveCleanup(
                  async () => {
                    const external: string[] = [];
                    await referenceContext.route('**/*', async (route) => {
                      if (new URL(route.request().url()).origin !== referenceBase) {
                        external.push(route.request().url());
                        await route.abort();
                      } else await route.continue();
                    });
                    const view = await referenceContext.newPage();
                    await view.goto(`${referenceBase}/test-fixtures/artboards/${file}`);
                    await view.evaluate(() => document.fonts.ready);
                    const captureStart = await settlePropertyCaptureStart(view);
                    const name = `property-reference-${width}x${height}.png`;
                    await view.screenshot({
                      path: new URL(name, captures).pathname,
                      fullPage: false,
                    });
                    manifest.push({
                      file: name,
                      evidencePath: `${folder.pathname.slice(directory.pathname.length)}${name}`,
                      hash: await copySurfaceEvidence(
                        new URL(name, captures),
                        new URL(name, folder),
                      ),
                    });
                    expect(external).toEqual([]);
                    await writeFile(
                      new URL(`reference-${width}.json`, folder),
                      JSON.stringify(
                        {
                          file,
                          width,
                          height,
                          captureStart,
                          sourceHash: createHash('sha256')
                            .update(
                              await readFile(
                                new URL(`../docs/design/canvas/project/${file}`, import.meta.url),
                              ),
                            )
                            .digest('hex'),
                          external,
                          version,
                        },
                        null,
                        2,
                      ),
                    );
                  },
                  () => referenceContext.close(),
                );
              }
              await writeFile(
                new URL('surfaces.json', directory),
                JSON.stringify({ version, files: manifest }, null, 2),
              );
              await copySurfaceEvidence(
                new URL('surfaces.json', directory),
                new URL('surfaces.json', folder),
              );
            },
            async () => {
              server.kill('SIGTERM');
              const stopped = await server;
              expect(stopped.exitCode === 0 || stopped.signal === 'SIGTERM').toBe(true);
            },
          );
        });
        expect(outside).toEqual([]);
        expect(forbidden).toEqual([]);
        await context.close();
      });
    },
    campaign,
    async () => {
      await browser?.close();
    },
    async () => {
      const ownedContainers = (
        await execa(
          'docker',
          [
            'ps',
            '--all',
            '--format',
            '{{.ID}}',
            '--filter',
            `label=com.docker.compose.project=${project}`,
          ],
          { timeout: 30000 },
        )
      ).stdout;
      const ownedVolumes = (
        await execa(
          'docker',
          [
            'volume',
            'ls',
            '--format',
            '{{.Name}}',
            '--filter',
            `label=com.docker.compose.project=${project}`,
          ],
          { timeout: 30000 },
        )
      ).stdout;
      const ownedNetworks = (
        await execa(
          'docker',
          [
            'network',
            'ls',
            '--format',
            '{{.ID}}',
            '--filter',
            `label=com.docker.compose.project=${project}`,
          ],
          { timeout: 30000 },
        )
      ).stdout;
      const remaining = {
        containers: (
          await execa('docker', ['ps', '--all', '--format', '{{.ID}}'], { timeout: 30000 })
        ).stdout
          .split('\n')
          .filter(Boolean),
        volumes: (
          await execa('docker', ['volume', 'ls', '--format', '{{.Name}}'], { timeout: 30000 })
        ).stdout
          .split('\n')
          .filter(Boolean),
      };
      expect(ownedContainers.trim()).toBe('');
      expect(ownedVolumes.trim()).toBe('');
      expect(ownedNetworks.trim()).toBe('');
      expect(foreignBaseline.containers.every((id) => remaining.containers.includes(id))).toBe(
        true,
      );
      expect(foreignBaseline.volumes.every((name) => remaining.volumes.includes(name))).toBe(true);
      campaign.stackTornDownUtc = new Date().toISOString();
      await writeFile(
        new URL('teardown.json', directory),
        JSON.stringify(
          {
            project,
            verifiedUtc: campaign.stackTornDownUtc,
            ownedContainers: [],
            ownedVolumes: [],
            ownedNetworks: [],
            foreignBaseline,
            remaining,
            outcome:
              'Exact-label absence verified after shared fixture teardown; pre-existing foreign containers and volumes preserved.',
          },
          null,
          2,
        ),
      );
    },
    () => writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2)),
    () => writeFile(new URL('findings.json', directory), '[]'),
    () =>
      writeFile(
        new URL('results/report.md', directory),
        `# Property browser campaign\n\nRun: ${runId}. Status: ${campaign.status}. ${attempts} semantic scenarios attempted; consult the append-only ledger for effective verdicts and executor failures.\n\nVersion: ${commit} with dirty implementation sources, Property SHA-256 ${version.propertySourceHash}. No mixed-version release approval is claimed.\n\nReproduce: pnpm exec vitest run --config vitest.integration.config.ts integration/web-property.integration.test.ts\n\n${campaign.stackTornDownUtc ? `Owned stack ${project} removal confirmed at ${campaign.stackTornDownUtc}.` : 'Removal not confirmed; inspect retained setup/primary/teardown failure.'}\n\nPrepared API evidence proves only prepared public reads. Persisted unresolved membership remains a separately labelled parser-validated component regression, not prepared API coverage. Retained-detail refetch failure and manual recovery are exercised through actual browser history with a bounded read fault and the real recovery endpoint. Parent visual/artboard comparison, detector and independent finish remain separate acceptance work. Screen-reader speech, daylight focus and zoom require human assessment.\n`,
      ),
  );
  console.info('Property campaign evidence', directory.pathname);
});
