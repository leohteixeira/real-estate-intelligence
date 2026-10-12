import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';
import {
  parsePlaceMarketResponse,
  parsePlaceResponse,
  parsePlacesResponse,
} from '../packages/contracts/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { checkAccessibility } from './support/accessibility.ts';
import { exerciseSystemStateReads } from './support/system-state-reads.ts';

test('web place tracer follows production acquisition, proxy and browser journeys', async () => {
  await withCampaign(async ({ command }) => {
    const project = `rei-web-place-${randomUUID()}`;
    const [postgres, rabbit, management, minio, minioConsole, api, web] = await allocatePorts(7);
    const user = 'rei_web_place';
    const password = 'controlled_web_place_fixture';
    const env = {
      ...process.env,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      COMPOSE_PROFILES: 'tools',
      NODE_ENV: 'test',
      POSTGRES_DB: user,
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
      POSTGRES_PORT: String(postgres),
      RABBITMQ_USER: user,
      RABBITMQ_PASSWORD: password,
      RABBITMQ_VHOST: user,
      RABBITMQ_PORT: String(rabbit),
      RABBITMQ_MANAGEMENT_PORT: String(management),
      MINIO_ROOT_USER: user,
      MINIO_ROOT_PASSWORD: password,
      MINIO_API_PORT: String(minio),
      MINIO_CONSOLE_PORT: String(minioConsole),
      OBJECT_STORE_BUCKET: 'rei-web-place',
      OBJECT_STORE_REGION: 'us-east-1',
      API_PORT: String(api),
      WEB_PORT: String(web),
      OUTBOX_RELAY_INTERVAL_MS: '100',
      COLLECTION_SCHEDULE_INTERVAL_MS: '30000',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      SNAPSHOT_ENCRYPTION_KEY_ID: '',
      SNAPSHOT_ENCRYPTION_KEY_BASE64: '',
    };
    const compose = (...args: string[]) =>
      command(
        'docker',
        [
          'compose',
          '--file',
          'compose.yaml',
          '--project-name',
          project,
          '--profile',
          'tools',
          ...args,
        ],
        { env, timeout: 240000, maxBuffer: 10 * 1024 * 1024 },
      );
    await compose(
      'up',
      '--detach',
      '--build',
      '--wait',
      'postgres',
      'rabbitmq',
      'minio',
      'migrations',
      'worker',
      'api',
      'web',
    );
    const base = `http://127.0.0.1:${web}`;
    const bela = 'sao-paulo-bela-vista';
    const readMedian = async () => {
      const response = await requestHttp(`${base}/api/v1/places/${bela}/market`);
      expect(response.status).toBe(200);
      return parsePlaceMarketResponse(await response.json()).figures
        .medianAskingPricePerSquareMeter;
    };
    expect((await readMedian()).state).toBe('insufficient-data');
    await compose('run', '--rm', 'collection-command', `web-place-${randomUUID()}`);
    await expect
      .poll(async () => (await readMedian()).state, { timeout: 60000, interval: 200 })
      .toBe('available');
    const median = await readMedian();
    expect(median.recordCount).toBe(1);
    expect(median.sources.map((source) => source.label)).toEqual(['synthetic-data']);
    expect(median.value?.minorUnits).toBe(951515);
    const browserEnv = { ...process.env };
    // This container inherits DISPLAY=:0 but has no X11 socket. Keep ANGLE truly headless.
    delete browserEnv.DISPLAY;
    const browser = await chromium.launch({
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
    await preserveCleanup(
      async () => {
        const captures = new URL('../apps/web/.impeccable/review/', import.meta.url);
        await mkdir(captures, { recursive: true });
        for (const width of [390, 960, 1440]) {
          for (const locale of ['pt-BR', 'en'] as const) {
            const context = await browser.newContext({
              viewport: { width, height: width === 390 ? 1706 : 1366 },
              reducedMotion: 'reduce',
            });
            await preserveCleanup(
              async () => {
                const external: string[] = [];
                const loadedFonts: string[] = [];
                const forbiddenRequests: string[] = [];
                const detailReads: string[] = [];
                await context.route('**/*', async (route) => {
                  const url = new URL(route.request().url());
                  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
                    external.push(`${url.protocol}//${url.host}`);
                    await route.abort();
                  } else await route.continue();
                });
                await context.addInitScript((choice) => {
                  if (localStorage.getItem('rei.locale') === null)
                    localStorage.setItem('rei.locale', choice);
                }, locale);
                const page = await context.newPage();
                const landingErrors: string[] = [];
                page.on('console', (message) => {
                  if (message.type() === 'error') landingErrors.push(message.text());
                });
                page.on('pageerror', (error) => landingErrors.push(error.message));
                page.on('request', (request) => {
                  const url = new URL(request.url());
                  if (url.pathname.startsWith('/api/')) {
                    if (
                      request.method() !== 'GET' ||
                      !/^\/api\/v1\/places(?:\/[a-z0-9-]+(?:\/(?:children|market))?)?$/.test(
                        url.pathname,
                      )
                    )
                      forbiddenRequests.push(`${request.method()} ${url.pathname}`);
                    if (url.pathname === `/api/v1/places/${bela}`) detailReads.push(url.pathname);
                  }
                });
                page.on('response', (response) => {
                  if (response.url().endsWith('.woff2') && response.ok())
                    loadedFonts.push(response.url());
                });
                await page.goto(`${base}/places/${bela}`);
                const expectedFigure = locale === 'en' ? 'R$ 9,515 /m²' : 'R$ 9.515 /m²';
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                await expect.poll(() => page.locator('.place-navigation a').count()).toBe(5);
                expect(
                  await page.getByRole('heading', { name: 'Bela Vista', exact: true }).isVisible(),
                ).toBe(true);
                expect(
                  await page.locator('.crumbs').getByText('Bela Vista', { exact: true }).count(),
                ).toBe(1);
                const breadcrumbLinks = page.locator('.place-head .crumbs a');
                expect(await breadcrumbLinks.count()).toBeGreaterThan(0);
                for (const link of await breadcrumbLinks.all())
                  expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
                if (width === 390) {
                  const home = page.locator('.place-top .brand');
                  expect(await home.getAttribute('href')).toBe('/');
                  expect((await home.boundingBox())?.height).toBeGreaterThanOrEqual(44);
                  expect(
                    await page
                      .locator('.public-footer .lang button[aria-pressed="false"]')
                      .evaluate((element) => getComputedStyle(element).color),
                  ).toBe('rgb(11, 44, 107)');
                }
                expect(await page.locator('.place-provenance').textContent()).toContain(
                  locale === 'en' ? '1 contributing property' : '1 imóvel contribuinte',
                );
                expect(await page.locator('.place-provenance').textContent()).toContain(
                  'synthetic-data',
                );
                expect(await page.locator('.place-provenance').textContent()).toContain(
                  locale === 'en' ? 'Computed at' : 'Calculada em',
                );
                expect(await page.locator('.place-provenance').textContent()).toContain('UTC');
                expect(await page.locator('html').getAttribute('lang')).toBe(locale);
                await page.evaluate(() => document.fonts.ready);
                const style = await page.locator('.plate__name').evaluate((element) => {
                  const css = getComputedStyle(element);
                  return {
                    family: css.fontFamily,
                    size: css.fontSize,
                    weight: css.fontWeight,
                    color: css.color,
                  };
                });
                expect(style).toMatchObject({
                  family: '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif',
                  size: width >= 960 ? '48px' : '36px',
                  weight: '600',
                  color: 'rgb(255, 255, 255)',
                });
                expect(loadedFonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                expect(loadedFonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(
                  true,
                );
                expect(
                  await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth,
                  ),
                ).toBe(true);
                expect(
                  await page
                    .getByRole('link', {
                      name: /Operations|Operações|Market|Mercado|Alerts|Alertas|Privacy|Privacidade|More|Mais|Review/,
                    })
                    .count(),
                ).toBe(0);
                const capture = new URL(`place-${width}-${locale}.png`, captures);
                const plate = await page.locator('.place-plate').boundingBox();
                const rail = await page.locator('.place-rail').boundingBox();
                expect(plate?.width).toBe(width === 390 ? 358 : 560);
                if (width >= 960) expect(rail?.width).toBe(232);
                console.info('web-place visual evidence', {
                  width,
                  locale,
                  style,
                  plate,
                  rail,
                  capture: capture.pathname,
                });
                await page.screenshot({ path: capture.pathname, fullPage: true });
                await checkAccessibility(page, `place-${width}-${locale}`);
                await page.screenshot({
                  path: new URL(`place-${width}-${locale}-top.png`, captures).pathname,
                });
                await exerciseSystemStateReads(page, base, width, locale, captures);
                await page.goto(`${base}/places/${bela}`);
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                const publicNavigation = page.locator(
                  width === 390 ? '.public-tabs' : '.public-rail-navigation',
                );
                const labels =
                  locale === 'en'
                    ? { places: 'Places', search: 'Search', ask: 'Ask' }
                    : { places: 'Lugares', search: 'Buscar', ask: 'Perguntar' };
                expect(await publicNavigation.getByRole('link').count()).toBe(3);
                for (const link of await publicNavigation.getByRole('link').all())
                  expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
                for (const [accepted, destination, suffix] of [
                  ['places', 'places', '/'],
                  ['search', 'search', '/'],
                  ['ask', 'ask', '/'],
                  ['Search', 'search', ''],
                  ['Ask', 'ask', ''],
                ] as const) {
                  await page.goto(`${base}/${accepted}/${bela}${suffix}`);
                  await expect
                    .poll(() =>
                      page.getByRole('heading', { name: 'Bela Vista', exact: true }).count(),
                    )
                    .toBe(1);
                  await expect.poll(() => page.locator('.place-navigation a').count()).toBe(5);
                  expect(await publicNavigation.locator('[aria-current="page"]').count()).toBe(1);
                  expect(
                    await publicNavigation.locator('[aria-current="page"]').textContent(),
                  ).toBe(labels[destination]);
                  expect(await page.title()).toBe(
                    `${labels[destination]} · Real Estate Intelligence`,
                  );
                  expect(
                    await page.locator('.place-navigation [aria-current="page"]').count(),
                  ).toBe(1);
                  expect(
                    await page.locator('.place-navigation [aria-current="page"]').textContent(),
                  ).toBe('Bela Vista');
                  expect(
                    await page
                      .locator('.place-navigation')
                      .getByRole('link', { name: 'Pinheiros', exact: true })
                      .getAttribute('href'),
                  ).toBe(`/${destination}/sao-paulo-pinheiros`);
                }
                await page.goto(`${base}/places/${bela}`);
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                for (const destination of ['search', 'ask'] as const) {
                  await publicNavigation
                    .getByRole('link', { name: labels[destination], exact: true })
                    .click();
                  await expect.poll(() => page.url()).toBe(`${base}/${destination}/${bela}`);
                  await expect
                    .poll(() =>
                      page.getByRole('heading', { name: labels[destination], exact: true }).count(),
                    )
                    .toBe(1);
                  expect(
                    await page
                      .getByRole('heading', { name: 'Bela Vista', exact: true })
                      .isVisible(),
                  ).toBe(true);
                  expect(await publicNavigation.locator('[aria-current="page"]').count()).toBe(1);
                  expect(
                    await publicNavigation.locator('[aria-current="page"]').textContent(),
                  ).toBe(labels[destination]);
                  expect(await page.title()).toBe(
                    `${labels[destination]} · Real Estate Intelligence`,
                  );
                  expect(await page.locator('.place-entry').textContent()).toContain(
                    destination === 'search'
                      ? locale === 'en'
                        ? 'The results and filters screen is not yet available in this version.'
                        : 'A tela de resultados e filtros ainda não está disponível nesta versão.'
                      : locale === 'en'
                        ? 'The runs screen is not yet available in this version.'
                        : 'A tela de execuções ainda não está disponível nesta versão.',
                  );
                  expect(await page.locator('form, .fig__value').count()).toBe(0);
                  expect(
                    await page.locator('.place-entry').evaluate((element) => {
                      const css = getComputedStyle(element);
                      return {
                        left: css.paddingLeft,
                        right: css.paddingRight,
                        top: css.paddingTop,
                      };
                    }),
                  ).toEqual({ left: '16px', right: '16px', top: '16px' });
                  expect(
                    await page.evaluate(
                      () => document.documentElement.scrollWidth <= window.innerWidth,
                    ),
                  ).toBe(true);
                  await page.evaluate(() => document.fonts.ready);
                  await checkAccessibility(page, `${destination}-${width}-${locale}`);
                  await page.evaluate(() => window.scrollTo(0, 0));
                  await page.screenshot({
                    path: new URL(`${destination}-${width}-${locale}.png`, captures).pathname,
                    fullPage: true,
                  });
                  await page.screenshot({
                    path: new URL(`${destination}-${width}-${locale}-top.png`, captures).pathname,
                  });
                  const beforeSwitch = detailReads.length;
                  const otherLocale = locale === 'en' ? 'pt-BR' : 'en';
                  await page
                    .getByRole('button', { name: locale === 'en' ? 'Português' : 'English' })
                    .filter({ visible: true })
                    .first()
                    .click();
                  await expect
                    .poll(() => page.locator('html').getAttribute('lang'))
                    .toBe(otherLocale);
                  expect(
                    await page
                      .getByRole('heading', {
                        name:
                          destination === 'search'
                            ? otherLocale === 'en'
                              ? 'Search'
                              : 'Buscar'
                            : otherLocale === 'en'
                              ? 'Ask'
                              : 'Perguntar',
                        exact: true,
                      })
                      .isVisible(),
                  ).toBe(true);
                  expect(page.url()).toBe(`${base}/${destination}/${bela}`);
                  expect(detailReads.length).toBe(beforeSwitch);
                  await page
                    .getByRole('button', { name: locale === 'en' ? 'English' : 'Português' })
                    .filter({ visible: true })
                    .first()
                    .click();
                  await expect.poll(() => page.locator('html').getAttribute('lang')).toBe(locale);
                  await page.reload();
                  await expect
                    .poll(() =>
                      page.getByRole('heading', { name: labels[destination], exact: true }).count(),
                    )
                    .toBe(1);
                }
                await page.goBack();
                await expect.poll(() => page.url()).toBe(`${base}/search/${bela}`);
                await expect
                  .poll(() =>
                    page.getByRole('heading', { name: labels.search, exact: true }).count(),
                  )
                  .toBe(1);
                await page.goForward();
                await expect.poll(() => page.url()).toBe(`${base}/ask/${bela}`);
                await page
                  .getByRole('link', {
                    name: locale === 'en' ? 'View the place median' : 'Ver a mediana do lugar',
                  })
                  .click();
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                await page.goto(`${base}/ask/${bela}`);
                await expect
                  .poll(() => page.getByRole('heading', { name: labels.ask, exact: true }).count())
                  .toBe(1);
                await publicNavigation
                  .getByRole('link', { name: labels.places, exact: true })
                  .click();
                await expect.poll(() => page.url()).toBe(`${base}/places/${bela}`);
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                expect(await publicNavigation.locator('[aria-current="page"]').textContent()).toBe(
                  labels.places,
                );
                expect(forbiddenRequests).toEqual([]);
                await page.reload();
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                const navigation = page.getByRole('navigation', {
                  name: locale === 'en' ? 'Place navigation' : 'Navegação de lugares',
                });
                await navigation.getByRole('link', { name: 'Pinheiros', exact: true }).click();
                await expect
                  .poll(() => page.locator('.place-unavailable').textContent())
                  .toBe(locale === 'en' ? 'Median not available' : 'Mediana não disponível');
                expect(await page.locator('.fig__value').count()).toBe(0);
                await page.goBack();
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                await page.goForward();
                await expect
                  .poll(() => page.locator('.place-unavailable').textContent())
                  .toBe(locale === 'en' ? 'Median not available' : 'Mediana não disponível');
                await page.goto(`${base}/places/${bela}`);
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(expectedFigure);
                const switchButton = page
                  .getByRole('button', { name: locale === 'en' ? 'Português' : 'English' })
                  .filter({ visible: true })
                  .first();
                await switchButton.focus();
                expect(
                  await switchButton.evaluate((element) => element.matches(':focus-visible')),
                ).toBe(true);
                await page.keyboard.press('Enter');
                const nextLocale = locale === 'en' ? 'pt-BR' : 'en';
                await expect.poll(() => page.locator('html').getAttribute('lang')).toBe(nextLocale);
                await page.reload();
                await expect.poll(() => page.locator('html').getAttribute('lang')).toBe(nextLocale);
                expect(await page.evaluate(() => localStorage.getItem('rei.locale'))).toBe(
                  nextLocale,
                );
                await expect
                  .poll(() => page.locator('.fig__value').textContent())
                  .toBe(nextLocale === 'en' ? 'R$ 9,515 /m²' : 'R$ 9.515 /m²');
                await page.goto(`${base}/places/BAD_ID`);
                expect(
                  await page
                    .getByRole('heading', {
                      name:
                        nextLocale === 'en'
                          ? 'Invalid place identifier.'
                          : 'Identificador de lugar inválido.',
                    })
                    .isVisible(),
                ).toBe(true);
                await page.goto(`${base}/places/missing-place`);
                await expect
                  .poll(() =>
                    page
                      .getByRole('heading', {
                        name: nextLocale === 'en' ? 'Place not found.' : 'Lugar não encontrado.',
                      })
                      .count(),
                  )
                  .toBe(1);
                landingErrors.length = 0;
                await page.goto(base);
                expect(await page.locator('.lp').count()).toBe(1);
                expect(await page.locator('.lp-h1').first().isVisible()).toBe(true);
                await expect
                  .poll(() =>
                    page.evaluate(
                      () =>
                        document.querySelector('.lp')?.classList.contains('lp--flat') ||
                        Boolean(
                          (document.querySelector('.lp-here') as HTMLElement | null)?.style
                            .transform,
                        ),
                    ),
                  )
                  .toBe(true);
                const rendering = {
                  ...(await page.evaluate(() => {
                    const canvas = document.querySelector<HTMLCanvasElement>('.lp-canvas');
                    const gl = canvas?.getContext('webgl2');
                    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
                    return {
                      flat: document.querySelector('.lp')?.classList.contains('lp--flat'),
                      anchor: (document.querySelector('.lp-here') as HTMLElement | null)?.style
                        .transform,
                      canvas: { width: canvas?.width, height: canvas?.height },
                      contextLost: gl?.isContextLost() ?? null,
                      renderer: debug ? gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
                    };
                  })),
                  errors: [...landingErrors],
                  backend:
                    'ANGLE SwiftShader WebGL (explicit, headless, sandboxed; unsafe fallback disabled)',
                  browser: await browser.version(),
                };
                await writeFile(
                  new URL(`landing-${width}-${nextLocale}-rendering.json`, captures),
                  JSON.stringify(rendering, null, 2),
                );
                expect(rendering, JSON.stringify(rendering, null, 2)).toMatchObject({
                  flat: false,
                  anchor: expect.stringContaining('translate3d'),
                  contextLost: false,
                  renderer: expect.stringContaining('SwiftShader'),
                  errors: [],
                });
                await checkAccessibility(page, `landing-${width}-${nextLocale}`);
                await page.evaluate(() => window.scrollTo(0, 0));
                await page.screenshot({
                  path: new URL(`landing-${width}-${nextLocale}.png`, captures).pathname,
                  fullPage: true,
                });
                await page.screenshot({
                  path: new URL(`landing-${width}-${nextLocale}-top.png`, captures).pathname,
                });
                expect(external).toEqual([]);
                expect(forbiddenRequests).toEqual([]);
              },
              () => context.close(),
            );
          }
        }
        const childrenUrl = `${base}/api/v1/places/sao-paulo-centro/children`;
        const childrenResponse = await requestHttp(childrenUrl);
        expect(childrenResponse.status).toBe(200);
        const children = parsePlacesResponse(await childrenResponse.json());
        expect(children.items.some((place) => place.id === bela)).toBe(true);
        const unbrokenName = 'Bairro'.repeat(100);
        const longNameChildren = parsePlacesResponse({
          ...children,
          items: children.items.map((place) =>
            place.id === bela
              ? { ...place, name: { en: unbrokenName, ptBR: unbrokenName } }
              : place,
          ),
        });
        const detailUrl = `${base}/api/v1/places/${bela}`;
        const detailResponse = await requestHttp(detailUrl);
        expect(detailResponse.status).toBe(200);
        const detail = parsePlaceResponse(await detailResponse.json());
        const ancestor = detail.place.breadcrumbs.find((crumb) => crumb.id !== bela)!;
        expect(ancestor).toBeDefined();
        const unbrokenAncestorName = 'Pais'.repeat(150);
        const longNameDetail = parsePlaceResponse({
          ...detail,
          place: {
            ...detail.place,
            name: { en: unbrokenName, ptBR: unbrokenName },
            breadcrumbs: detail.place.breadcrumbs.map((crumb) =>
              crumb.id === ancestor.id
                ? { ...crumb, name: { en: unbrokenAncestorName, ptBR: unbrokenAncestorName } }
                : crumb.id === bela
                  ? { ...crumb, name: { en: unbrokenName, ptBR: unbrokenName } }
                  : crumb,
            ),
          },
        });
        for (const width of [390, 960, 1440]) {
          const longNameContext = await browser.newContext({
            viewport: { width, height: width === 390 ? 1706 : 1366 },
            reducedMotion: 'reduce',
          });
          await preserveCleanup(
            async () => {
              const external: string[] = [];
              await longNameContext.route('**/*', async (route) => {
                const url = new URL(route.request().url());
                if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
                  external.push(`${url.protocol}//${url.host}`);
                  await route.abort();
                } else if (url.href === childrenUrl) {
                  await route.fulfill({ json: longNameChildren });
                } else if (url.href === detailUrl) {
                  await route.fulfill({ json: longNameDetail });
                } else await route.continue();
              });
              const page = await longNameContext.newPage();
              await page.goto(`${base}/places/${bela}`);
              const link = page.locator('.place-navigation').getByRole('link', {
                name: unbrokenName,
                exact: true,
              });
              await expect.poll(() => link.count()).toBe(1);
              await page.evaluate(() => document.fonts.ready);
              expect(await link.textContent()).toBe(unbrokenName);
              expect(await link.getAttribute('href')).toBe(`/places/${bela}`);
              const bounds = await link.boundingBox();
              expect(bounds).not.toBeNull();
              expect(bounds!.x).toBeGreaterThanOrEqual(0);
              expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
              expect(bounds!.height).toBeGreaterThan(44);
              expect(
                await link.evaluate((element) => element.scrollWidth <= element.clientWidth),
              ).toBe(true);
              await expect
                .poll(() => page.locator('.plate__name').textContent())
                .toBe(unbrokenName);
              const currentCrumb = page.locator('.crumbs [aria-current="page"]');
              expect(await currentCrumb.textContent()).toBe(unbrokenName);
              const ancestorLink = page.locator('.crumbs').getByRole('link', {
                name: unbrokenAncestorName,
                exact: true,
              });
              expect(await ancestorLink.textContent()).toBe(unbrokenAncestorName);
              expect(await ancestorLink.getAttribute('href')).toBe(`/places/${ancestor.id}`);
              for (const label of await page.locator('.crumbs li, .crumbs a, .plate__name').all()) {
                const box = await label.boundingBox();
                expect(box).not.toBeNull();
                expect(box!.x).toBeGreaterThanOrEqual(0);
                expect(box!.x + box!.width).toBeLessThanOrEqual(width);
                expect(
                  await label.evaluate((element) => element.scrollWidth <= element.clientWidth),
                ).toBe(true);
              }
              expect(
                await page.evaluate(
                  () => document.documentElement.scrollWidth <= window.innerWidth,
                ),
              ).toBe(true);
              await ancestorLink.click();
              await expect.poll(() => page.url()).toBe(`${base}/places/${ancestor.id}`);
              await expect
                .poll(() =>
                  page.getByRole('heading', { name: ancestor.name.ptBR, exact: true }).count(),
                )
                .toBe(1);
              expect(external).toEqual([]);
            },
            () => longNameContext.close(),
          );
        }
      },
      () => cleanupAll(() => browser.close()),
    );
  });
});
