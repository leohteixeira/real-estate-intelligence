import { mkdir, writeFile, appendFile, readFile, readdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';
import { parsePlaceResponse, PROPERTY_SORTS } from '../packages/contracts/dist/index.js';
import type { SearchQuery } from '../packages/contracts/dist/index.js';
import { allocatePorts, preserveCleanup, withCampaign } from './support/fixture.ts';
import { copySurfaceEvidence, runSearchCampaign } from './support/search-campaign.ts';
import { requestHttp } from './support/http.ts';
import { checkAccessibility } from './support/accessibility.ts';
import {
  readSearch,
  checkSearch,
  checkSearchRows,
  searchParameters,
} from './support/search-reads.ts';

const scenarios = [
  {
    id: 'SEARCH-001',
    title: 'Prepared scope and all filters remain server-owned',
    given:
      'An isolated prepared city with five synthetic properties and median 951220 minor units per m².',
    when: 'Apply each published filter independently through the Filters editor.',
    then: 'URL minor units and actual rows/count/median match the public API; identical and zero outcomes remain truthful.',
  },
  {
    id: 'SEARCH-002',
    title: 'Every ordering and cursor page comes from the server',
    given: 'The five prepared city properties.',
    when: 'Select each of four orderings and load a smaller cursor page.',
    then: 'Server order and full-result median are retained while pages append and input changes reset the cursor.',
  },
  {
    id: 'SEARCH-003',
    title: 'Draft cancellation, clear, apply and browser history',
    given: 'An applied explicit-false query.',
    when: 'Edit and cancel, clear within the editor, then apply and traverse history.',
    then: 'Draft changes do not mutate the applied URL and false remains a genuine constraint.',
  },
  {
    id: 'SEARCH-004',
    title: 'Exact localized amounts and safe malformed input',
    given: 'PT and EN locales with a city draft.',
    when: 'Enter locale money and decimal area, then inverted ranges and an unknown deep-link key.',
    then: 'Exact minor units are sent only for valid inputs; invalid requests are not forwarded and genuine clear recovery is available.',
  },
  {
    id: 'SEARCH-005',
    title: 'Proven empty attribution and real ancestor recovery',
    given: 'Reduced has three city results, returned has one, and their intersection is empty.',
    when: 'Apply both flags, relax the attributed group and widen the original empty search.',
    then: 'Returned excludes the last three, relaxing returns three and widening retains filters on the actual state ancestor.',
  },
  {
    id: 'SEARCH-006',
    title: 'Registered hierarchy and neutral zero-property scope',
    given: 'The complete registered place hierarchy includes zero-property street blocks.',
    when: 'Choose an unfiltered zero-property block from the editor.',
    then: 'It is reachable and shows a neutral empty result without invented responsible filters.',
  },
  {
    id: 'SEARCH-007',
    title: 'Independent read failures recover through manual retry',
    given: 'A valid city search and editor.',
    when: 'Inject bounded transport failures for result, preview and diagnostic reads, then retry manually.',
    then: 'Place context and draft survive, no false zero/count is displayed and genuine responses recover.',
  },
  {
    id: 'SEARCH-008',
    title: 'Pinned surfaces in both locales and three viewports',
    given: 'Bela Vista and city Search/Filters with local fonts.',
    when: 'Render PT and EN at 390, 960 and 1440, walk native controls and disclose evidence.',
    then: 'No horizontal overflow or external request occurs; every control is at least 44px, keyboard works and full-page axe reports no violations.',
  },
].map((scenario) => ({
  ...scenario,
  area: 'Search',
  persona: 'public visitor',
  journey: scenario.title,
  verification: {
    oracle: 'Ticket 6.6 intent contract and independently parsed prepared public API.',
    method: 'Real Chromium plus Supertest response readback; no fixture membership changes.',
  },
  dependencies: [],
}));

test('Search and Filters follow prepared public contracts through the real proxy and Chromium', async () => {
  const runId = `search-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = new URL(`../apps/web/.impeccable/review/campaigns/${runId}/`, import.meta.url);
  const captures = new URL('../apps/web/.impeccable/review/', import.meta.url);
  await mkdir(new URL('catalog/', directory), { recursive: true });
  await mkdir(new URL('results/', directory), { recursive: true });
  await mkdir(new URL('evidence/', directory), { recursive: true });
  await writeFile(
    new URL('catalog/scenarios.json', directory),
    JSON.stringify({ scenarios }, null, 2),
  );
  await writeFile(
    new URL('catalog/search.feature', directory),
    scenarios
      .map(
        (s) =>
          `Scenario: ${s.id} ${s.title}\n  Given ${s.given}\n  When ${s.when}\n  Then ${s.then}`,
      )
      .join('\n\n'),
  );
  const project = `rei-web-search-${randomUUID()}`;
  const [postgres, api, web] = await allocatePorts(3);
  const base = `http://127.0.0.1:${web}`;
  const campaign = {
    runId,
    status: 'running',
    scope: 'Ticket 6.6 prepared Search and Filters, read-only real HTTP/browser campaign',
    exclusions: [
      'acquired/event-fed Overview metrics',
      'Property/Map/Alerts/Ask execution',
      'production/VPS',
    ],
    targetUrls: [base],
    personas: ['public visitor'],
    dataOwnership: project,
    allowedSideEffects: ['Own Compose containers/network/volumes', 'Local test evidence'],
    completionCriteria:
      'Eight distinct semantic scenarios and requested locale/viewport captures pass with owned teardown',
    stackTornDownUtc: null as string | null,
  };
  const head = (await readFile(new URL('../.git/HEAD', import.meta.url), 'utf8')).trim();
  const commit = head.startsWith('ref: ')
    ? (await readFile(new URL(`../.git/${head.slice(5)}`, import.meta.url), 'utf8')).trim()
    : head;
  const assets = new URL('../apps/web/dist/assets/', import.meta.url);
  const assetHash = createHash('sha256');
  for (const file of (await readdir(assets)).filter((name) => /\.(?:js|css)$/.test(name)).sort()) {
    assetHash.update(file).update(await readFile(new URL(file, assets)));
  }
  const version = {
    commit,
    dirty: true,
    webArtifactHash: assetHash.digest('hex'),
    artifactScope:
      'Local production build JS/CSS, rebuilt from the same shipping sources as the owned web image; not a production/VPS release identity.',
    webSourceHash: createHash('sha256')
      .update(await readFile(new URL('../apps/web/src/search/SearchResults.tsx', import.meta.url)))
      .digest('hex'),
    backendArtifactHash: createHash('sha256')
      .update(await readFile(new URL('../apps/api/dist/main.js', import.meta.url)))
      .digest('hex'),
    project,
    observedUtc: new Date().toISOString(),
  };
  await writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2));
  await writeFile(
    new URL('inventory.json', directory),
    JSON.stringify(
      {
        owner: project,
        preparedPublicIds: ['sao-paulo', 'sao-paulo-bela-vista'],
        preparation:
          'Repository-owned migrations/prepared synthetic adapter; no acquisition performed.',
      },
      null,
      2,
    ),
  );
  const environment = {
    ...process.env,
    COMPOSE_DISABLE_ENV_FILE: '1',
    COMPOSE_ENV_FILES: '',
    NODE_ENV: 'test',
    POSTGRES_DB: 'rei_web_search',
    POSTGRES_USER: 'rei_web_search',
    POSTGRES_PASSWORD: 'controlled-search-fixture',
    POSTGRES_PORT: String(postgres),
    API_PORT: String(api),
    WEB_PORT: String(web),
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  const browserEnv = { ...process.env };
  delete browserEnv.DISPLAY;
  let attempts = 0;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
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
          { env: environment, timeout: 240000, maxBuffer: 10 * 1024 * 1024 },
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
          viewport: { width: 390, height: 1706 },
          reducedMotion: 'reduce',
        });
        await context.addInitScript(() => localStorage.setItem('rei.locale', 'pt-BR'));
        const page = await context.newPage();
        const requestQueries: string[] = [];
        page.on('request', (request) => {
          const url = new URL(request.url());
          if (url.pathname === '/api/v1/properties') requestQueries.push(url.search);
        });
        async function attempt(id: string, action: () => Promise<unknown>) {
          const startedUtc = new Date().toISOString();
          const attemptId = `${id}-${attempts++}`;
          const folder = new URL(`evidence/${attemptId}/`, directory);
          await mkdir(folder, { recursive: true });
          let failure: unknown;
          try {
            await action();
          } catch (error) {
            failure = error;
          }
          await page.screenshot({ path: new URL('final.png', folder).pathname, fullPage: true });
          await writeFile(
            new URL('environment.json', folder),
            JSON.stringify({ version }, null, 2),
          );
          await writeFile(
            new URL('readback.json', folder),
            JSON.stringify(
              {
                url: page.url(),
                requestQueries,
                body: (await page.locator('main').textContent())?.slice(0, 12000),
                failure: failure instanceof Error ? failure.message : null,
              },
              null,
              2,
            ),
          );
          const evidence = `evidence/${attemptId}`;
          await appendFile(
            new URL('results/attempts.jsonl', directory),
            JSON.stringify({
              attemptId,
              scenarioId: id,
              kind: 'scenario',
              status: failure ? 'failed' : 'approved',
              executorError: failure !== undefined,
              reason:
                failure instanceof Error
                  ? failure.message
                  : 'All declared response/UI checks passed.',
              startedUtc,
              finishedUtc: new Date().toISOString(),
              environmentEvidence: `${evidence}/environment.json`,
              finalUiEvidence: `${evidence}/final.png`,
              evidence: [
                `${evidence}/readback.json`,
                ...(id === 'SEARCH-008' && !failure ? [`${evidence}/surfaces.json`] : []),
              ],
              verification: {
                expected: scenarios.find((s) => s.id === id)?.then,
                observed: failure
                  ? 'Recorded failed assertion'
                  : 'All declared native Vitest checks passed.',
                comparison:
                  'Response counts/order/amounts and independently specified prepared bounds checked before verdict.',
              },
            }) + '\n',
          );
          if (failure) throw failure;
        }
        const city = 'sao-paulo';
        const goto = async (query: SearchQuery) => {
          const { placeId, ...rest } = query;
          await page.goto(
            `${base}/search/${placeId}${Object.keys(rest).length ? '?' + searchParameters(rest) : ''}`,
          );
          return checkSearch(page, base, query, 'pt-BR');
        };
        const editor = async () => {
          await page.goto(`${base}/search/${city}?view=filters`);
          await expect
            .poll(() =>
              page.locator('.search-filters__actions button[type="submit"]').textContent(),
            )
            .toBe('Mostrar 5 imóveis');
        };
        const apply = async (query: SearchQuery) => {
          const expected = await readSearch(base, query);
          await expect
            .poll(() =>
              page.locator('.search-filters__actions button[type="submit"]').textContent(),
            )
            .toBe(
              `Mostrar ${expected.totalItems} ${expected.totalItems === 1 ? 'imóvel' : 'imóveis'}`,
            );
          await page.locator('.search-filters__actions button[type="submit"]').click();
          expect(new URL(page.url()).pathname).toBe(`/search/${query.placeId}`);
          for (const [key, value] of Object.entries(query))
            if (key !== 'placeId')
              expect(new URL(page.url()).searchParams.get(key)).toBe(String(value));
          await checkSearch(page, base, query, 'pt-BR');
        };
        await attempt('SEARCH-001', async () => {
          const baseline = await goto({ placeId: city });
          expect(baseline.totalItems).toBe(5);
          expect(baseline.medianPricePerSquareMeter).toBe(951220);
          for (const [type, label, count] of [
            ['apartment', 'Apartamento', 4],
            ['house', 'Casa', 1],
            ['studio', 'Estúdio', 0],
            ['commercial', 'Comercial', 0],
            ['land', 'Terreno', 0],
          ] as const) {
            await editor();
            await page.getByRole('button', { name: label, exact: true }).click();
            await apply({ placeId: city, propertyType: type });
            expect((await readSearch(base, { placeId: city, propertyType: type })).totalItems).toBe(
              count,
            );
          }
          for (const [key, label, value, normalized] of [
            ['minAskingPrice', 'Preço pedido (R$) — Mínimo', '600.000,50', 60000050],
            ['maxAskingPrice', 'Preço pedido (R$) — Máximo', '900.000', 90000000],
            ['minPricePerSquareMeter', 'Preço pedido por m² (R$) — Mínimo', '9.000', 900000],
            ['maxPricePerSquareMeter', 'Preço pedido por m² (R$) — Máximo', '10.000', 1000000],
            ['minArea', 'Área (m²) — Mínimo', '82', 82],
            ['maxArea', 'Área (m²) — Máximo', '82', 82],
          ] as const) {
            await editor();
            await page.getByRole('textbox', { name: label, exact: true }).fill(value);
            await apply({ placeId: city, [key]: normalized });
          }
          for (const [key, label, value, count] of [
            ['minBedrooms', 'Quartos', '3', 3],
            ['minBathrooms', 'Banheiros', '3', 1],
            ['minParkingSpaces', 'Vagas de garagem', '2', 2],
          ] as const) {
            await editor();
            if (key === 'minBedrooms')
              await page
                .getByRole('group', { name: label, exact: true })
                .getByRole('button', { name: '3+', exact: true })
                .click();
            else await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
            await apply({ placeId: city, [key]: Number(value) });
            expect(
              (await readSearch(base, { placeId: city, [key]: Number(value) })).totalItems,
            ).toBe(count);
          }
          for (const [band, count] of [
            ['up-to-30', 0],
            ['31-to-90', 0],
            ['over-90', 5],
            ['over-180', 5],
          ] as const) {
            await editor();
            await page
              .getByRole('combobox', { name: 'Tempo de anúncio', exact: true })
              .selectOption(band);
            await apply({ placeId: city, timeOnMarket: band });
            expect((await readSearch(base, { placeId: city, timeOnMarket: band })).totalItems).toBe(
              count,
            );
          }
          for (const [key, label, count] of [
            ['priceReduced', 'Preço reduzido', 3],
            ['returnedToMarket', 'Voltou ao mercado', 1],
            ['multipleListings', 'Mais de um anúncio', 3],
          ] as const) {
            await editor();
            await page.getByRole('button', { name: label, exact: true }).click();
            await apply({ placeId: city, [key]: true });
            expect((await readSearch(base, { placeId: city, [key]: true })).totalItems).toBe(count);
          }
        });
        await attempt('SEARCH-002', async () => {
          await goto({ placeId: city });
          for (const sort of PROPERTY_SORTS) {
            await page.getByRole('combobox', { name: 'Ordenar' }).selectOption(sort);
            await checkSearch(page, base, { placeId: city, sort }, 'pt-BR');
            expect(new URL(page.url()).searchParams.get('sort')).toBe(sort);
          }
          const pagedQuery = { placeId: city, pageSize: 2, sort: 'furthest-below-median' } as const;
          await page.goto(`${base}/search/${city}?pageSize=2&sort=${pagedQuery.sort}`);
          const first = await checkSearch(page, base, pagedQuery, 'pt-BR');
          expect(first.nextCursor).not.toBeNull();
          await page.getByRole('button', { name: 'Mostrar mais imóveis' }).click();
          const second = await readSearch(base, {
            ...pagedQuery,
            cursor: first.nextCursor!,
          });
          await checkSearchRows(
            page,
            { ...first, items: [...first.items, ...second.items] },
            'pt-BR',
          );
          expect(second.medianPricePerSquareMeter).toBe(first.medianPricePerSquareMeter);
          await page.getByRole('combobox', { name: 'Ordenar' }).selectOption('most-recent');
          await checkSearch(
            page,
            base,
            { placeId: city, pageSize: 2, sort: 'most-recent' },
            'pt-BR',
          );
          expect(new URL(page.url()).searchParams.has('cursor')).toBe(false);
          await page.getByRole('combobox', { name: 'Ordenar' }).selectOption(pagedQuery.sort);
          await checkSearch(page, base, pagedQuery, 'pt-BR');
          expect(new URL(page.url()).searchParams.has('cursor')).toBe(false);
        });
        await attempt('SEARCH-003', async () => {
          await goto({ placeId: city, priceReduced: false });
          await page.getByRole('link', { name: 'Filtros', exact: true }).click();
          await page
            .getByRole('combobox', { name: 'Preço reduzido', exact: true })
            .selectOption('true');
          await page.getByRole('link', { name: 'Fechar filtros' }).click();
          expect(new URL(page.url()).searchParams.get('priceReduced')).toBe('false');
          await checkSearch(page, base, { placeId: city, priceReduced: false }, 'pt-BR');
          await page.getByRole('link', { name: 'Filtros', exact: true }).click();
          await page.getByRole('button', { name: 'Limpar tudo' }).click();
          expect(new URL(page.url()).searchParams.get('priceReduced')).toBe('false');
          await apply({ placeId: city });
          await page.goBack();
          expect(new URL(page.url()).searchParams.get('view')).toBe('filters');
          await page.goBack();
          expect(new URL(page.url()).searchParams.get('priceReduced')).toBe('false');
          await page.goForward();
          expect(new URL(page.url()).searchParams.get('view')).toBe('filters');
        });
        await attempt('SEARCH-004', async () => {
          await editor();
          await page
            .getByRole('textbox', { name: 'Preço pedido (R$) — Mínimo', exact: true })
            .fill('600.000,50');
          await page.getByRole('textbox', { name: 'Área (m²) — Mínimo', exact: true }).fill('82,5');
          await apply({ placeId: city, minAskingPrice: 60000050, minArea: 82.5 });
          await page.setViewportSize({ width: 960, height: 1366 });
          for (const locale of ['pt-BR', 'en'] as const) {
            await page.goto(`${base}/search/${city}?view=filters`);
            await page
              .locator('.rail')
              .getByRole('button', { name: locale === 'en' ? 'English' : 'Português', exact: true })
              .click();
            await expect
              .poll(() =>
                page.locator('.search-filters__actions button[type="submit"]').textContent(),
              )
              .toBe(locale === 'en' ? 'Show 5 properties' : 'Mostrar 5 imóveis');
            await page.locator('#minArea').fill(locale === 'en' ? '1,234' : '1.234');
            await page.locator('#minAskingPrice').fill(locale === 'en' ? '1.234' : '1,234');
            await expect.poll(() => page.locator('#draft-error').isVisible()).toBe(true);
            await page
              .locator('.rail')
              .getByRole('button', { name: locale === 'en' ? 'Português' : 'English', exact: true })
              .click();
            expect(await page.locator('#minArea').inputValue()).toBe(
              locale === 'en' ? '1.234' : '1,234',
            );
            expect(await page.locator('#draft-error').isVisible()).toBe(true);
            expect(
              await page.locator('.search-filters__actions button[type="submit"]').isDisabled(),
            ).toBe(true);
            await page.locator('#minAskingPrice').fill('');
            await expect
              .poll(() =>
                page.locator('.search-filters__actions button[type="submit"]').textContent(),
              )
              .toBe(locale === 'en' ? 'Mostrar 0 imóveis' : 'Show 0 properties');
            await page.locator('.search-filters__actions button[type="submit"]').click();
            expect(new URL(page.url()).searchParams.get('minArea')).toBe('1234');
            expect((await readSearch(base, { placeId: city, minArea: 1234 })).totalItems).toBe(0);
          }
          await page
            .locator('.rail')
            .getByRole('button', { name: 'Português', exact: true })
            .click();
          await page.setViewportSize({ width: 390, height: 1706 });
          await editor();
          await page.getByRole('textbox', { name: 'Área (m²) — Mínimo', exact: true }).fill('90');
          await page.getByRole('textbox', { name: 'Área (m²) — Máximo', exact: true }).fill('82');
          expect(
            await page.locator('.search-filters__actions button[type="submit"]').isDisabled(),
          ).toBe(true);
          expect(await page.locator('#draft-error').isVisible()).toBe(true);
          const before = requestQueries.length;
          await page.goto(`${base}/search/${city}?unknown=bad`);
          expect(await page.getByRole('alert').textContent()).toContain('Filtros inválidos');
          expect(requestQueries.length).toBe(before);
          await page.getByRole('link', { name: 'Limpar filtros', exact: true }).click();
          await checkSearch(page, base, { placeId: city }, 'pt-BR');
        });
        await attempt('SEARCH-005', async () => {
          await goto({ placeId: city, priceReduced: true, returnedToMarket: true });
          await expect
            .poll(() => page.locator('.search-empty').textContent())
            .toContain('O filtro Voltou ao mercado elimina os últimos 3 imóveis.');
          await page.getByRole('button', { name: 'Relaxar Voltou ao mercado' }).click();
          await checkSearch(page, base, { placeId: city, priceReduced: true }, 'pt-BR');
          await goto({ placeId: city, priceReduced: true, returnedToMarket: true });
          await page.getByRole('button', { name: 'Ampliar para Estado de São Paulo' }).click();
          expect(new URL(page.url()).pathname).toBe('/search/sao-paulo-state');
          expect(new URL(page.url()).searchParams.get('returnedToMarket')).toBe('true');
        });
        await attempt('SEARCH-006', async () => {
          await editor();
          await expect.poll(() => page.locator('#filter-place option').count()).toBeGreaterThan(10);
          const options = await page.locator('#filter-place option').evaluateAll((elements) =>
            elements.map((element) => ({
              value: (element as HTMLOptionElement).value,
              label: element.textContent,
            })),
          );
          let emptyId: string | undefined;
          for (const option of options) {
            if (
              option.label?.includes(' / ') &&
              (await readSearch(base, { placeId: option.value })).totalItems === 0
            ) {
              const response = await requestHttp(`${base}/api/v1/places/${option.value}`);
              if (parsePlaceResponse(await response.json()).place.kind === 'street-block') {
                emptyId = option.value;
                break;
              }
            }
          }
          expect(emptyId).toBeDefined();
          await page.getByRole('combobox', { name: 'Lugar', exact: true }).selectOption(emptyId!);
          await apply({ placeId: emptyId! });
          await expect
            .poll(() => page.locator('.search-empty').textContent())
            .toContain('Nenhum imóvel preparado');
          expect(await page.getByRole('button', { name: /Relaxar/ }).count()).toBe(0);
        });
        await attempt('SEARCH-007', async () => {
          let fail = true;
          await page.route('**/api/v1/properties?**', async (route) => {
            if (fail)
              await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({
                  error: {
                    code: 'unavailable',
                    message: 'controlled transport failure',
                    requestId: 'search-test-request',
                  },
                }),
              });
            else await route.continue();
          });
          await page.goto(`${base}/search/${city}?sort=longest-on-market`);
          const totalFailure = page
            .locator('.system-state')
            .filter({ hasText: 'Não foi possível carregar o total deste lugar.' });
          const resultsFailure = page
            .locator('.system-state')
            .filter({ hasText: 'Não foi possível carregar os imóveis.' });
          await expect.poll(() => totalFailure.getByRole('alert').count()).toBe(1);
          await expect.poll(() => resultsFailure.getByRole('alert').count()).toBe(1);
          expect(
            await page.getByRole('heading', { name: 'São Paulo', exact: true }).isVisible(),
          ).toBe(true);
          fail = false;
          await totalFailure.getByRole('button', { name: 'Tentar de novo' }).click();
          await expect.poll(() => totalFailure.count()).toBe(0);
          await resultsFailure.getByRole('button', { name: 'Tentar de novo' }).click();
          await expect.poll(() => resultsFailure.count()).toBe(0);
          await checkSearch(page, base, { placeId: city, sort: 'longest-on-market' }, 'pt-BR');
          fail = true;
          await page.goto(`${base}/search/${city}?propertyType=house&view=filters`);
          await expect
            .poll(() => page.locator('.search-filters__actions button[type="submit"]').isDisabled())
            .toBe(true);
          await expect
            .poll(() => page.getByRole('alert').textContent())
            .toContain('Não foi possível contar');
          expect(
            await page
              .getByRole('button', { name: 'Casa', exact: true })
              .getAttribute('aria-pressed'),
          ).toBe('true');
          fail = false;
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await expect
            .poll(() =>
              page.locator('.search-filters__actions button[type="submit"]').textContent(),
            )
            .toBe('Mostrar 1 imóvel');
          await page.unroute('**/api/v1/properties?**');
          let diagnosticFail = true;
          await page.route('**/api/v1/properties?**', async (route) => {
            const query = new URL(route.request().url()).searchParams;
            if (diagnosticFail && query.has('priceReduced') && !query.has('returnedToMarket'))
              await route.fulfill({ status: 503, body: 'controlled diagnostic failure' });
            else await route.continue();
          });
          await page.goto(`${base}/search/${city}?priceReduced=true&returnedToMarket=true`);
          await expect
            .poll(() => page.locator('.search-empty').textContent())
            .toContain('Não foi possível identificar');
          expect(await page.getByRole('button', { name: /Relaxar/ }).count()).toBe(0);
          diagnosticFail = false;
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await expect
            .poll(() => page.locator('.search-empty').textContent())
            .toContain('últimos 3 imóveis');
          await page.unroute('**/api/v1/properties?**');
        });
        await attempt('SEARCH-008', async () => {
          const surfaceEvidence = new URL('evidence/SEARCH-008-7/', directory);
          const manifest: { file: string; hash: string }[] = [];
          for (const width of [390, 960, 1440])
            for (const locale of ['pt-BR', 'en'] as const) {
              const visual = await browser!.newContext({
                viewport: { width, height: width === 390 ? 1706 : 1366 },
                reducedMotion: 'reduce',
              });
              await preserveCleanup(
                async () => {
                  await visual.addInitScript(
                    (choice) => localStorage.setItem('rei.locale', choice),
                    locale,
                  );
                  const external: string[] = [];
                  const fonts: string[] = [];
                  const forbidden: string[] = [];
                  const outgoingQueries: string[] = [];
                  await visual.route('**/*', async (route) => {
                    const url = new URL(route.request().url());
                    if (url.hostname !== '127.0.0.1') {
                      external.push(url.host);
                      await route.abort();
                    } else await route.continue();
                  });
                  const view = await visual.newPage();
                  view.on('response', (response) => {
                    if (response.url().endsWith('.woff2') && response.ok())
                      fonts.push(response.url());
                  });
                  view.on('request', (request) => {
                    const url = new URL(request.url());
                    if (url.pathname === '/api/v1/properties') outgoingQueries.push(url.search);
                    if (
                      url.pathname.startsWith('/api/') &&
                      (request.method() !== 'GET' ||
                        url.pathname.includes('/market') ||
                        /^\/api\/v1\/properties\//.test(url.pathname))
                    )
                      forbidden.push(url.pathname);
                  });
                  for (const placeId of ['sao-paulo-bela-vista', city])
                    for (const surface of ['search', 'filters']) {
                      await view.goto(
                        `${base}/search/${placeId}${surface === 'filters' ? '?view=filters' : ''}`,
                      );
                      if (surface === 'search') await checkSearch(view, base, { placeId }, locale);
                      else {
                        await expect
                          .poll(() =>
                            view
                              .locator('.search-filters__actions button[type="submit"]')
                              .isDisabled(),
                          )
                          .toBe(false);
                        await expect
                          .poll(() => view.locator('#filter-place option').count())
                          .toBeGreaterThan(10);
                      }
                      await view.evaluate(() => document.fonts.ready);
                      const shell = {
                        top: await view.locator('.place-top').isVisible(),
                        navigation: await view.locator('.place-navigation').isVisible(),
                        plate: await view.locator('.place-head').isVisible(),
                        footer: await view.locator('.public-footer').isVisible(),
                        tabs: await view.locator('.tabbar').isVisible(),
                        rail: await view.locator('.place-rail').isVisible(),
                      };
                      let composition;
                      if (surface === 'filters') {
                        const selectedPath = await view
                          .locator('#filter-place option:checked')
                          .textContent();
                        expect(selectedPath?.split(' / ')[0]).toBe(
                          placeId === city ? 'São Paulo' : 'Bela Vista',
                        );
                        expect(await view.locator('.search-filters__path').textContent()).toBe(
                          selectedPath,
                        );
                        composition = await view.locator('.search-filters').evaluate((element) => {
                          const head = element.querySelector<HTMLElement>('.search-filters__head')!;
                          const heading = head.querySelector('h2')!;
                          const form = element.querySelector<HTMLElement>('form')!;
                          const path = element.querySelector<HTMLElement>('.search-filters__path')!;
                          const label = element.querySelector<HTMLElement>(
                            '.search-filters__range label',
                          )!;
                          return {
                            headerY: head.getBoundingClientRect().y,
                            headerBottom: head.getBoundingClientRect().bottom,
                            sheetY: form.getBoundingClientRect().y,
                            sheetRadius: getComputedStyle(form).borderTopLeftRadius,
                            groupGap: getComputedStyle(form).gap,
                            headingFont: getComputedStyle(heading).fontFamily,
                            headingCase: getComputedStyle(heading).textTransform,
                            rangeColor: getComputedStyle(label).color,
                            rangeWeight: getComputedStyle(label).fontWeight,
                            completePath: path.textContent,
                            pathFits: path.scrollWidth <= path.clientWidth,
                          };
                        });
                        expect(composition.pathFits).toBe(true);
                        if (width === 390) {
                          expect(shell).toEqual({
                            top: false,
                            navigation: false,
                            plate: false,
                            footer: false,
                            tabs: false,
                            rail: false,
                          });
                          expect(composition.headerY).toBe(0);
                          expect(composition.sheetY).toBe(composition.headerBottom);
                          expect(composition.sheetRadius).toBe('14px');
                          expect(composition.groupGap).toBe('20px');
                          expect(composition.headingFont).toContain('Barlow Condensed');
                          expect(composition.headingCase).toBe('uppercase');
                          expect(composition.rangeColor).toBe('rgb(61, 74, 102)');
                          expect(composition.rangeWeight).toBe('400');
                          expect(await view.locator('.sheet__grab').isVisible()).toBe(true);
                        } else {
                          expect(shell.rail).toBe(true);
                          expect(shell.navigation).toBe(true);
                          expect(shell.plate).toBe(true);
                          expect(await view.locator('.sheet__grab').isVisible()).toBe(false);
                        }
                      } else if (width === 390) {
                        expect(shell).toEqual({
                          top: true,
                          navigation: true,
                          plate: true,
                          footer: true,
                          tabs: true,
                          rail: false,
                        });
                      }
                      expect(await view.locator('html').getAttribute('lang')).toBe(locale);
                      expect(
                        await view.evaluate(
                          () => document.documentElement.scrollWidth <= innerWidth,
                        ),
                      ).toBe(true);
                      const targets = [];
                      for (const control of await view
                        .locator('main button, main select, main input, main summary, main a')
                        .all()) {
                        if (await control.isVisible()) {
                          const target = {
                            label: await control.evaluate((element) => element.outerHTML),
                            height: (await control.boundingBox())?.height,
                          };
                          targets.push(target);
                          expect(target.height, target.label).toBeGreaterThanOrEqual(44);
                        }
                      }
                      expect(
                        await view
                          .locator('.plate__name')
                          .evaluate((element) => getComputedStyle(element).fontFamily),
                      ).toContain('Barlow Condensed');
                      const name = `${surface}-${placeId}-${width}-${locale}`;
                      await view.evaluate(() => scrollTo(0, 0));
                      await view.screenshot({
                        path: new URL(`${name}.png`, captures).pathname,
                        fullPage: true,
                      });
                      await view.screenshot({
                        path: new URL(`${name}-top.png`, captures).pathname,
                      });
                      await checkAccessibility(view, name);
                      let keyboard;
                      if (surface === 'filters') {
                        const asking =
                          locale === 'en'
                            ? 'Asking price (R$) — Minimum'
                            : 'Preço pedido (R$) — Mínimo';
                        const field = view.getByRole('textbox', { name: asking, exact: true });
                        await field.focus();
                        const focused = await field.evaluate((element) => ({
                          focusVisible: element.matches(':focus-visible'),
                          outline: getComputedStyle(element).outline,
                        }));
                        expect(focused.focusVisible).toBe(true);
                        await view.keyboard.type(locale === 'en' ? '600,000.50' : '600.000,50');
                        await view.keyboard.press('Tab');
                        expect(await field.inputValue()).toBe(
                          locale === 'en' ? '600,000.50' : '600.000,50',
                        );
                        await expect
                          .poll(() =>
                            view
                              .locator('.search-filters__actions button[type="submit"]')
                              .isDisabled(),
                          )
                          .toBe(false);
                        const preview = await readSearch(base, {
                          placeId,
                          minAskingPrice: 60000050,
                        });
                        expect(
                          outgoingQueries.some((query) => {
                            const parameters = new URLSearchParams(query);
                            return (
                              parameters.get('placeId') === placeId &&
                              parameters.get('minAskingPrice') === '60000050'
                            );
                          }),
                        ).toBe(true);
                        expect(
                          await view
                            .locator('.search-filters__actions button[type="submit"]')
                            .textContent(),
                        ).toContain(String(preview.totalItems));
                        keyboard = {
                          actions: [
                            'Focus minimum asking price',
                            'Type localized exact amount',
                            'Tab to next field',
                          ],
                          focused,
                          value: await field.inputValue(),
                          nextFocusedId: await view.evaluate(() => document.activeElement?.id),
                          expectedMinorUnits: 60000050,
                          outgoingQuery: outgoingQueries.at(-1),
                          previewCount: preview.totalItems,
                        };
                        expect(keyboard.nextFocusedId).toBe('maxAskingPrice');
                      } else {
                        const evidence = view.locator('.search-median summary');
                        await evidence.focus();
                        await view.keyboard.press('Enter');
                        expect(
                          await view.locator('.search-median details').getAttribute('open'),
                        ).not.toBeNull();
                        expect(
                          await view.locator('.search-median details').textContent(),
                        ).toContain(locale === 'en' ? 'does not report' : 'não informa');
                        keyboard = { actions: ['Focus evidence disclosure', 'Enter'], open: true };
                      }
                      await writeFile(
                        new URL(`${name}-interaction.json`, captures),
                        JSON.stringify(
                          {
                            url: view.url(),
                            locale,
                            width,
                            observedUtc: new Date().toISOString(),
                            horizontalOverflow: false,
                            targets,
                            shell,
                            composition,
                            keyboard,
                            exclusions: [
                              'Ambient-daylight focus visibility and screen-reader speech require human review',
                            ],
                          },
                          null,
                          2,
                        ),
                      );
                      for (const suffix of [
                        '.png',
                        '-top.png',
                        '-accessibility.json',
                        '-interaction.json',
                      ]) {
                        const file = `${name}${suffix}`;
                        manifest.push({
                          file,
                          hash: await copySurfaceEvidence(
                            new URL(file, captures),
                            new URL(file, surfaceEvidence),
                          ),
                        });
                      }
                    }
                  expect(fonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                  expect(fonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(
                    true,
                  );
                  expect(external).toEqual([]);
                  expect(forbidden).toEqual([]);
                },
                () => visual.close(),
              );
            }
          await goto({ placeId: city });
          await writeFile(
            new URL('surfaces.json', surfaceEvidence),
            JSON.stringify({ version, files: manifest }, null, 2),
          );
        });
        await context.close();
      });
    },
    campaign,
    async () => {
      await browser?.close();
    },
    () => writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2)),
    () => writeFile(new URL('findings.json', directory), '[]'),
    () =>
      writeFile(
        new URL('results/report.md', directory),
        `# Search browser campaign\n\nRun: ${runId}\n\nStatus: ${campaign.status}. ${attempts} distinct scenarios attempted. See append-only attempts for verdicts, expected/observed checks and failed executor assertions.\n\nReproduce: pnpm exec vitest run --config vitest.integration.config.ts integration/web-search.integration.test.ts\n\n${campaign.stackTornDownUtc ? `Owned stack ${project} removal confirmed at ${campaign.stackTornDownUtc}.` : `Owned stack ${project} removal not confirmed by this run; inspect the retained primary/teardown failure.`} Prepared data only; no production or acquired-data equivalence claimed. Captures and full-page axe evidence live in the parent review directory.\n`,
      ),
  );
  console.info('Search campaign evidence', directory.pathname);
});
