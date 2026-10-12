import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';
import { parsePlaceMarketResponse, parsePlaceResponse } from '../packages/contracts/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { checkAccessibility } from './support/accessibility.ts';

test('constructed system states retain owned API evidence and working recovery in both locales', async () => {
  await withCampaign(async ({ command }) => {
    const project = `rei-web-states-${randomUUID()}`;
    const [postgres, rabbit, management, minio, minioConsole, api, fixturePort] =
      await allocatePorts(7);
    const user = 'rei_web_states';
    const env = {
      ...process.env,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      COMPOSE_PROFILES: 'tools',
      NODE_ENV: 'test',
      POSTGRES_DB: user,
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: 'controlled_web_states_fixture',
      POSTGRES_PORT: String(postgres),
      RABBITMQ_USER: user,
      RABBITMQ_PASSWORD: 'controlled_web_states_fixture',
      RABBITMQ_VHOST: user,
      RABBITMQ_PORT: String(rabbit),
      RABBITMQ_MANAGEMENT_PORT: String(management),
      MINIO_ROOT_USER: user,
      MINIO_ROOT_PASSWORD: 'controlled_web_states_fixture',
      MINIO_API_PORT: String(minio),
      MINIO_CONSOLE_PORT: String(minioConsole),
      OBJECT_STORE_BUCKET: 'rei-web-states',
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
    const id = 'sao-paulo-bela-vista';
    await compose('run', '--rm', 'collection-command', `web-states-${randomUUID()}`);
    const readMarket = async () => {
      const response = await requestHttp(`${base}/api/v1/places/${id}/market`);
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
    const response = await requestHttp(`${base}/api/v1/places/${id}`);
    expect(response.status).toBe(200);
    const place = parsePlaceResponse(await response.json());
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
        const entry = '/test-fixtures/system-states/';
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
          executablePath: '/usr/bin/chromium',
          chromiumSandbox: true,
        });
        await preserveCleanup(
          async () => {
            const captures = new URL('../apps/web/.impeccable/review/', import.meta.url);
            await mkdir(captures, { recursive: true });
            for (const width of [390, 960, 1280, 1440])
              for (const locale of ['pt-BR', 'en'] as const) {
                const context = await browser.newContext({
                  viewport: { width, height: width === 1280 ? 1127 : 1366 },
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
                      (payload) => Object.assign(window, { systemStatePayload: payload }),
                      { market, place, locale },
                    );
                    const page = await context.newPage();
                    const errors: string[] = [];
                    page.on('pageerror', (error) => errors.push(error.message));
                    page.on('console', (message) => {
                      if (message.type() === 'error') errors.push(message.text());
                    });
                    page.on('response', (read) => {
                      if (read.ok() && read.url().endsWith('.woff2')) fonts.push(read.url());
                    });
                    await page.goto(`${fixtureBase}${entry}`);
                    await expect
                      .poll(() => page.locator('.system-fixture__columns > section').count())
                      .toBe(4);
                    await page.evaluate(() => document.fonts.ready);
                    expect(errors).toEqual([]);
                    expect(fonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                    expect(fonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(
                      true,
                    );
                    expect(await page.locator('h1').first().textContent()).toContain(
                      locale === 'en' ? 'Constructed' : 'construídos',
                    );
                    expect(await page.locator('.fig__value').textContent()).toBe(
                      locale === 'en' ? 'R$ 9,515 /m²' : 'R$ 9.515 /m²',
                    );
                    expect(
                      await page
                        .locator('.fig__value')
                        .evaluate((element) => getComputedStyle(element).fontSize),
                    ).toBe('48px');
                    expect(await page.locator('.system-stale').first().textContent()).toContain(
                      locale === 'en' ? '2 days' : '2 dias',
                    );
                    expect(await page.locator('.system-stale').first().locator('a').count()).toBe(
                      0,
                    );
                    expect(await page.locator('.system-error__reference').count()).toBe(1);
                    expect(await page.locator('body').textContent()).not.toContain(
                      'private-invalid-header',
                    );
                    expect(
                      await page.locator('.system-fixture__edges .system-empty').textContent(),
                    ).toContain('BairroCanônico'.repeat(25));
                    for (const control of await page.locator('a, button').all()) {
                      const bounds = await control.boundingBox();
                      expect(bounds?.height).toBeGreaterThanOrEqual(44);
                      expect(bounds?.width).toBeGreaterThanOrEqual(44);
                    }
                    expect(
                      await page.evaluate(
                        () => document.documentElement.scrollWidth <= window.innerWidth,
                      ),
                    ).toBe(true);
                    for (const node of await page
                      .locator('.system-state, .system-stale, .system-state h3, .system-state .btn')
                      .all())
                      expect(
                        await node.evaluate(
                          (element) => element.scrollWidth <= element.clientWidth,
                        ),
                      ).toBe(true);
                    await checkAccessibility(page, `system-states-${width}-${locale}`);
                    await page.evaluate(() => window.scrollTo(0, 0));
                    const retry = page.locator('.system-fixture__columns .system-error button');
                    expect(await retry.textContent()).toBe(
                      locale === 'en' ? 'Try again' : 'Tentar de novo',
                    );
                    const errorNote = page.locator('.system-fixture__columns .system-error .note');
                    expect((await retry.boundingBox())?.width).toBe(
                      (await errorNote.boundingBox())?.width,
                    );
                    if (width === 1280)
                      await page.screenshot({
                        path: new URL(`system-states-${width}-${locale}-top.png`, captures)
                          .pathname,
                        fullPage: false,
                      });
                    await page.screenshot({
                      path: new URL(`system-states-${width}-${locale}.png`, captures).pathname,
                      fullPage: true,
                    });
                    const geometry = await page
                      .locator(
                        '.system-fixture__columns > section, .system-state, .system-stale, a, button',
                      )
                      .evaluateAll((elements) =>
                        elements.map((element) => {
                          const bounds = element.getBoundingClientRect();
                          return {
                            tag: element.tagName,
                            className: element.className,
                            x: bounds.x,
                            y: bounds.y,
                            width: bounds.width,
                            height: bounds.height,
                            scrollWidth: element.scrollWidth,
                            clientWidth: element.clientWidth,
                          };
                        }),
                      );
                    const raise = page.locator('.system-fixture__columns .system-empty button');
                    await raise.focus();
                    expect(
                      await raise.evaluate((element) => element.matches(':focus-visible')),
                    ).toBe(true);
                    expect(
                      await raise.evaluate((element) => getComputedStyle(element).outlineWidth),
                    ).toBe('3px');
                    await page.keyboard.press('Enter');
                    await expect
                      .poll(() =>
                        page
                          .locator('.system-fixture__columns .system-empty [role="status"]')
                          .textContent(),
                      )
                      .toContain(locale === 'en' ? 'R$ 10,000' : 'R$ 10.000');
                    await page.keyboard.press('Tab');
                    const widen = page.locator('.system-fixture__columns .system-empty a').first();
                    expect(
                      await widen.evaluate((element) => element.matches(':focus-visible')),
                    ).toBe(true);
                    await page.keyboard.press('Enter');
                    expect(new URL(page.url()).hash).toBe('#owned-zone');
                    expect(await page.locator('#owned-zone').isVisible()).toBe(true);
                    await page.locator('.system-fixture__columns .system-empty a').nth(1).click();
                    expect(new URL(page.url()).hash).toBe('#owned-alert');
                    const noIdRetry = page.locator('.system-fixture__edges .system-error button');
                    await page.keyboard.press('Tab');
                    await noIdRetry.focus();
                    expect(
                      await noIdRetry.evaluate((element) => element.matches(':focus-visible')),
                    ).toBe(true);
                    await page.keyboard.press('Enter');
                    await expect
                      .poll(() => page.locator('.system-fixture__edges .system-error').count())
                      .toBe(0);
                    expect(
                      await page
                        .locator('.system-fixture__edges [role="status"]')
                        .last()
                        .textContent(),
                    ).toBe(
                      locale === 'en'
                        ? 'Owned recovery action executed'
                        : 'Ação de recuperação própria executada',
                    );
                    expect(
                      await page.locator('.system-fixture__columns .system-error').count(),
                    ).toBe(1);
                    await page.locator('.system-fixture__columns .system-error button').focus();
                    await page.keyboard.press('Enter');
                    await expect
                      .poll(() => page.locator('.system-fixture__columns .system-error').count())
                      .toBe(0);
                    // The other order must also recover the no-ID case independently.
                    await page.reload();
                    await page.locator('.system-fixture__columns .system-error button').focus();
                    await page.keyboard.press('Enter');
                    await expect
                      .poll(() => page.locator('.system-fixture__columns .system-error').count())
                      .toBe(0);
                    expect(await page.locator('.system-fixture__edges .system-error').count()).toBe(
                      1,
                    );
                    await page.locator('.system-fixture__edges .system-error button').focus();
                    await page.keyboard.press('Enter');
                    await expect
                      .poll(() => page.locator('.system-fixture__edges .system-error').count())
                      .toBe(0);
                    expect(
                      await page
                        .locator('.system-fixture__edges [role="status"]')
                        .last()
                        .textContent(),
                    ).toBe(
                      locale === 'en'
                        ? 'Owned recovery action executed'
                        : 'Ação de recuperação própria executada',
                    );
                    await page.locator('.system-fixture__edges .system-stale a').click();
                    expect(new URL(page.url()).hash).toBe('#owned-collection');
                    expect(outside).toEqual([]);
                    expect(errors).toEqual([]);
                    await checkAccessibility(page, `system-states-recovered-${width}-${locale}`);
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await page.screenshot({
                      path: new URL(`system-states-recovered-${width}-${locale}.png`, captures)
                        .pathname,
                      fullPage: true,
                    });
                    await writeFile(
                      new URL(`system-states-${width}-${locale}-geometry.json`, captures),
                      JSON.stringify(
                        {
                          width,
                          locale,
                          constructedCases: [
                            'empty filter counts/prices',
                            'stale age/source failure',
                            'support UUID',
                          ],
                          actualData: 'Parsed owned synthetic API median, provenance and place',
                          fonts,
                          geometry,
                          outside,
                          actions: [
                            'relax limit',
                            'widen place',
                            'alert destination',
                            'retry callback',
                            'independent no-ID keyboard retry in both orders',
                            'authorized collection destination',
                          ],
                          errors,
                        },
                        null,
                        2,
                      ),
                    );
                  },
                  () => context.close(),
                );
              }
            const context = await browser.newContext({
              viewport: { width: 1280, height: 1127 },
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
                page.on('response', (read) => {
                  if (read.ok() && read.url().endsWith('.woff2')) fonts.push(read.url());
                });
                const response = await page.goto(
                  `${fixtureBase}/test-fixtures/artboards/States.dc.html`,
                );
                expect(response?.status()).toBe(200);
                await page.evaluate(() => document.fonts.ready);
                expect(await page.locator('.rei').boundingBox()).toMatchObject({
                  x: 0,
                  y: 0,
                  width: 1280,
                  height: 1127,
                });
                expect(fonts.some((url) => url.includes('barlow-latin-400'))).toBe(true);
                expect(fonts.some((url) => url.includes('barlow-condensed-latin-600'))).toBe(true);
                expect(outside).toEqual([]);
                await page.screenshot({ path: new URL('reference-States.png', captures).pathname });
                const source = new URL(
                  '../docs/design/canvas/project/States.dc.html',
                  import.meta.url,
                );
                await writeFile(
                  new URL('reference-States.json', captures),
                  JSON.stringify(
                    {
                      source: 'docs/design/canvas/project/States.dc.html',
                      sourceSha256: createHash('sha256')
                        .update(await readFile(source))
                        .digest('hex'),
                      viewport: { width: 1280, height: 1127 },
                      fonts,
                      outside,
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
    async function inspect(directory: URL): Promise<void> {
      for (const item of await readdir(directory, { withFileTypes: true })) {
        const path = new URL(item.name + (item.isDirectory() ? '/' : ''), directory);
        expect(item.name).not.toContain('test-fixtures');
        if (item.isDirectory()) await inspect(path);
        else if (/\.(?:html|js)$/.test(item.name)) {
          const content = await readFile(path, 'utf8');
          expect(content).not.toContain('systemStatePayload');
          expect(content).not.toContain('/test-fixtures/system-states/');
        }
      }
    }
    await inspect(new URL('../apps/web/dist/', import.meta.url));
  });
});
