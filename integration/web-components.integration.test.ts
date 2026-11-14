import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';
import { parsePlaceMarketResponse, parseSearchResponse } from '../packages/contracts/dist/index.js';
import {
  allocatePorts,
  cleanupAll,
  preserveCleanup,
  withPreparedSearchCampaign as withCampaign,
} from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { checkAccessibility } from './support/accessibility.ts';

test('shared Placa components use parsed owned data and labelled edge cases in both locales', async () => {
  await withCampaign(async ({ command }) => {
    const project = `rei-web-components-${randomUUID()}`;
    const [postgres, rabbit, management, minio, minioConsole, api, fixturePort] =
      await allocatePorts(7);
    const user = 'rei_web_components';
    const password = 'controlled_web_components_fixture';
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
      OBJECT_STORE_BUCKET: 'rei-web-components',
      OBJECT_STORE_REGION: 'us-east-1',
      API_PORT: String(api),
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
    );
    const base = `http://127.0.0.1:${api}`;
    const placeId = 'sao-paulo-bela-vista';
    await compose('run', '--rm', 'collection-command', `web-components-${randomUUID()}`);
    const readMarket = async () => {
      const response = await requestHttp(`${base}/api/v1/places/${placeId}/market`);
      expect(response.status).toBe(200);
      return parsePlaceMarketResponse(await response.json());
    };
    await expect
      .poll(async () => (await readMarket()).figures.medianAskingPricePerSquareMeter.state, {
        timeout: 60000,
        interval: 200,
      })
      .toBe('available');
    const market = await readMarket();
    const response = await requestHttp(`${base}/api/v1/properties?placeId=${placeId}`);
    expect(response.status).toBe(200);
    const search = parseSearchResponse(await response.json());
    expect(search.items.length).toBeGreaterThan(0);
    const property = search.items[0]!;
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
        String(fixturePort),
        '--strictPort',
      ],
      { cwd: fileURLToPath(new URL('..', import.meta.url)), reject: false },
    );
    await preserveCleanup(
      async () => {
        const fixtureBase = `http://127.0.0.1:${fixturePort}`;
        const entry = '/test-fixtures/shared-components/';
        await expect
          .poll(
            async () => {
              try {
                return (await requestHttp(`${fixtureBase}${entry}`)).status;
              } catch {
                return 0;
              }
            },
            { timeout: 30000, interval: 200 },
          )
          .toBe(200);
        const browser = await chromium.launch({
          executablePath: chromium.executablePath(),
          chromiumSandbox: true,
        });
        await preserveCleanup(
          async () => {
            const captures = new URL('../apps/web/.impeccable/review/', import.meta.url);
            await mkdir(captures, { recursive: true });
            for (const width of [390, 960, 1440])
              for (const locale of ['pt-BR', 'en'] as const) {
                const context = await browser.newContext({
                  viewport: { width, height: 1366 },
                  reducedMotion: 'reduce',
                });
                await preserveCleanup(
                  async () => {
                    const outside: string[] = [];
                    const fonts: string[] = [];
                    await context.route('**/*', async (route) => {
                      const url = new URL(route.request().url());
                      if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
                        outside.push(url.host);
                        await route.abort();
                      } else await route.continue();
                    });
                    await context.addInitScript(
                      (payload) => {
                        Object.assign(window, { sharedComponentPayload: payload });
                      },
                      { search, market, locale },
                    );
                    const page = await context.newPage();
                    const browserErrors: string[] = [];
                    page.on('pageerror', (error) => browserErrors.push(error.message));
                    page.on('console', (message) => {
                      if (message.type() === 'error') browserErrors.push(message.text());
                    });
                    page.on('response', (read) => {
                      if (read.ok() && read.url().endsWith('.woff2')) fonts.push(read.url());
                    });
                    await page.goto(`${fixtureBase}${entry}`);
                    await expect
                      .poll(async () => ({
                        rows: await page.locator('.prow').count(),
                        browserErrors,
                      }))
                      .toEqual({ rows: 5, browserErrors: [] });
                    const actual = page.locator('.prow').first();
                    expect(await actual.textContent()).toContain(
                      locale === 'en' ? property.place.name.en : property.place.name.ptBR,
                    );
                    // A router link resolves its in-page target against the fixture path.
                    expect(await actual.getAttribute('href')).toBe(`${entry}#owned-property`);
                    expect(await actual.locator('a').count()).toBe(0);
                    expect(await page.locator('.fig__value').first().textContent()).toBe(
                      locale === 'en' ? 'R$ 9,515 /m²' : 'R$ 9.515 /m²',
                    );
                    expect(await page.locator('.prov').first().textContent()).toContain(
                      locale === 'en' ? '1 contributing property' : '1 imóvel contribuinte',
                    );
                    expect(await page.locator('.prow').nth(1).textContent()).toContain(
                      locale === 'en' ? '0 bedrooms' : '0 quartos',
                    );
                    expect(await page.locator('.prow').nth(1).textContent()).not.toContain('R$ 0');
                    expect(await page.locator('.prow').nth(2).textContent()).toContain(
                      locale === 'en' ? '3.1% above median' : '3,1% acima da mediana',
                    );
                    expect(await page.locator('.prow').nth(2).textContent()).toContain(
                      locale === 'en' ? 'Returned to market' : 'Voltou ao mercado',
                    );
                    expect(await page.locator('.prow').nth(3).textContent()).toContain(
                      locale === 'en' ? 'At the median' : 'Na mediana',
                    );
                    expect(await page.locator('.prow').nth(4).textContent()).toContain(
                      locale === 'en' ? '3.1% below median' : '3,1% abaixo da mediana',
                    );
                    await page.evaluate(() => document.fonts.ready);
                    expect(fonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                    expect(fonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(
                      true,
                    );
                    expect(
                      await page
                        .locator('.fig__value')
                        .first()
                        .evaluate((element) => getComputedStyle(element).fontSize),
                    ).toBe('48px');
                    expect(
                      await page
                        .locator('.fig__value small')
                        .first()
                        .evaluate((element) => getComputedStyle(element).fontSize),
                    ).toBe('22px');
                    for (const link of await page.getByRole('link').all()) {
                      const bounds = await link.boundingBox();
                      expect(bounds?.height).toBeGreaterThanOrEqual(44);
                      expect(bounds?.width).toBeGreaterThanOrEqual(44);
                    }
                    const contributor = await page.locator('.prov > span').first().boundingBox();
                    const source = await page.locator('.prov__sources a').first().boundingBox();
                    expect(contributor).not.toBeNull();
                    expect(source).not.toBeNull();
                    expect(
                      Math.abs(
                        contributor!.y + contributor!.height / 2 - source!.y - source!.height / 2,
                      ),
                    ).toBeLessThanOrEqual(1);
                    expect(
                      await page.evaluate(
                        () => document.documentElement.scrollWidth <= window.innerWidth,
                      ),
                    ).toBe(true);
                    for (const element of await page
                      .locator('.prow, .prow > div, .fig, .prov__sources')
                      .all())
                      expect(
                        await element.evaluate((node) => node.scrollWidth <= node.clientWidth),
                      ).toBe(true);
                    await checkAccessibility(page, `components-${width}-${locale}`);
                    await page.screenshot({
                      path: new URL(`components-${width}-${locale}.png`, captures).pathname,
                      fullPage: true,
                    });
                    console.info('shared component visual evidence', {
                      width,
                      locale,
                      referenceArtboards: [
                        'docs/design/canvas/project/Components.dc.html',
                        'docs/design/canvas/project/Search.dc.html',
                      ],
                    });
                    // Start from the first link in the figure, then Tab to the native property row.
                    await page.locator('.prov a').first().focus();
                    await page.keyboard.press('Tab');
                    expect(
                      await actual.evaluate((element) => element.matches(':focus-visible')),
                    ).toBe(true);
                    expect(
                      await actual.evaluate((element) => getComputedStyle(element).outlineWidth),
                    ).toBe('3px');
                    await page.keyboard.press('Enter');
                    await expect.poll(() => new URL(page.url()).hash).toBe('#owned-property');
                    expect(await page.locator('#owned-property').isVisible()).toBe(true);
                    if (width === 390 && locale === 'pt-BR') {
                      // Prove the shared gate rejects a real violation with actionable diagnostics.
                      await page.evaluate(() => {
                        const button = document.createElement('button');
                        button.id = 'a11y-negative-control';
                        document.body.append(button);
                      });
                      try {
                        await expect(
                          checkAccessibility(page, 'expected-failure-unnamed-button'),
                        ).rejects.toThrow(/button-name[\s\S]*helpUrl[\s\S]*#a11y-negative-control/);
                      } finally {
                        await page.evaluate(() =>
                          document.getElementById('a11y-negative-control')?.remove(),
                        );
                      }
                      await checkAccessibility(page, `components-${width}-${locale}`);
                    }
                    expect(outside).toEqual([]);
                  },
                  () => context.close(),
                );
              }
            for (const artboard of [
              { name: 'Components', width: 1280, height: 1882 },
              { name: 'Search', width: 390, height: 1249 },
              { name: 'Main', width: 390, height: 1706 },
              { name: 'PlaceEN', width: 390, height: 1706 },
              { name: 'DesktopPlace', width: 1440, height: 1366 },
            ]) {
              const context = await browser.newContext({
                viewport: { width: artboard.width, height: artboard.height },
                reducedMotion: 'reduce',
              });
              await preserveCleanup(
                async () => {
                  const outside: string[] = [];
                  const fonts: string[] = [];
                  await context.route('**/*', async (route) => {
                    const url = new URL(route.request().url());
                    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
                      outside.push(url.host);
                      await route.abort();
                    } else await route.continue();
                  });
                  const page = await context.newPage();
                  const errors: string[] = [];
                  page.on('pageerror', (error) => errors.push(error.message));
                  page.on('response', (response) => {
                    if (response.ok() && response.url().endsWith('.woff2'))
                      fonts.push(response.url());
                  });
                  const entry = `/test-fixtures/artboards/${artboard.name}.dc.html`;
                  const response = await page.goto(`${fixtureBase}${entry}`);
                  expect(response?.status()).toBe(200);
                  await page.evaluate(() => document.fonts.ready);
                  expect(await page.locator('.rei').boundingBox()).toMatchObject({
                    x: 0,
                    y: 0,
                    width: artboard.width,
                    height: artboard.height,
                  });
                  expect(fonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                  expect(fonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(
                    true,
                  );
                  expect(errors).toEqual([]);
                  expect(outside).toEqual([]);
                  await page.screenshot({
                    path: new URL(`reference-${artboard.name}.png`, captures).pathname,
                  });
                  const source = new URL(
                    `../docs/design/canvas/project/${artboard.name}.dc.html`,
                    import.meta.url,
                  );
                  await writeFile(
                    new URL(`reference-${artboard.name}.json`, captures),
                    JSON.stringify(
                      {
                        source: `docs/design/canvas/project/${artboard.name}.dc.html`,
                        sourceSha256: createHash('sha256')
                          .update(await readFile(source))
                          .digest('hex'),
                        viewport: { width: artboard.width, height: artboard.height },
                        fonts,
                        outsideRequests: outside,
                        adaptations: [
                          'Google font link replaced with pinned bundled local fonts',
                          'Absent canvas-editor support.js omitted; static markup unchanged',
                        ],
                      },
                      null,
                      2,
                    ),
                  );
                },
                () => context.close(),
              );
            }
          },
          () => cleanupAll(() => browser.close()),
        );
      },
      async () => {
        server.kill('SIGTERM');
        const result = await server;
        expect(result.signal ?? result.exitCode).toBe('SIGTERM');
      },
    );
    const dist = new URL('../apps/web/dist/', import.meta.url);
    async function inspect(directory: URL): Promise<void> {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = new URL(item.name + (item.isDirectory() ? '/' : ''), directory);
        expect(item.name).not.toContain('test-fixtures');
        if (item.isDirectory()) await inspect(path);
        else if (/\.(?:html|js)$/.test(item.name)) {
          const content = await readFile(path, 'utf8');
          expect(content).not.toContain('sharedComponentPayload');
          expect(content).not.toContain('/test-fixtures/artboards/');
          expect(content).not.toContain('owned-artboard-references');
        }
      }
    }
    await inspect(dist);
  });
});
