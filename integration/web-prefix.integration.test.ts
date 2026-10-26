import { randomUUID } from 'node:crypto';
import { execa } from 'execa';
import { chromium } from 'playwright';
import { expect, test } from 'vitest';
import { parseAskFixtureCatalogue } from '../packages/contracts/dist/index.js';
import { allocatePorts, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

for (const prefix of ['', '/real-estate-intelligence']) {
  test(`production web retains ${prefix || 'root'} assets, bilingual navigation, deep routes, API and SSE`, async () => {
    const project = `rei-prefix-${randomUUID()}`;
    const [postgres, api, web] = await allocatePorts(3);
    const fixture = new ComposeFixture(
      project,
      {
        NODE_ENV: 'test',
        POSTGRES_USER: 'rei_prefix',
        POSTGRES_PASSWORD: 'controlled_prefix_fixture',
        POSTGRES_DB: 'rei_prefix',
        POSTGRES_PORT: String(postgres),
        API_PORT: String(api),
        WEB_PORT: String(web),
        OTEL_EXPORTER_OTLP_ENDPOINT: '',
        VITE_PUBLIC_BASE: `${prefix}/`,
      },
      { preparedSearch: true },
    );
    const origin = `http://127.0.0.1:${web}`;
    const base = `${origin}${prefix}`;
    await preserveCleanup(
      async () => {
        for (const service of ['migrations', 'api', 'web']) {
          const image =
            service === 'web' && prefix
              ? 'rei-prefix-images-web'
              : `rei-readiness-images-${service}`;
          await execa('docker', ['image', 'tag', image, `${project}-${service}`]);
        }
        await fixture.up(['postgres', 'migrations', 'rabbitmq', 'api', 'web']);
        const ready = await requestHttp(`${base}/ready`);
        expect(ready.status).toBe(200);
        expect(await ready.json()).toEqual({
          status: 'ready',
          database: 'available',
          broker: 'available',
        });
        const root = await requestHttp(`${base}/`);
        expect(root.status).toBe(308);
        expect(root.headers.get('location')).toBe(
          'https://leohteixeira.com/en/projects/real-estate-intelligence',
        );
        if (prefix) {
          for (const path of ['/ready', '/api/v1/places', '/index.html']) {
            expect((await requestHttp(`${origin}${path}`)).status).toBe(404);
          }
        }
        const catalogueResponse = await requestHttp(`${base}/api/v1/ask/fixtures`);
        expect(catalogueResponse.status).toBe(200);
        const catalogue = parseAskFixtureCatalogue(await catalogueResponse.json());
        const example = catalogue.items.find((item) => item.state === 'queued');
        expect(example).toBeDefined();
        const stream = await requestHttp(`${base}/api/v1/runs/${example!.runId}/events`, {
          headers: { Authorization: `Bearer ${example!.grant.capability}` },
        });
        expect(stream.status).toBe(200);
        expect(stream.headers.get('content-type')).toContain('text/event-stream');
        expect(await stream.text()).toContain('completed');
        const browserEnv = { ...process.env };
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
            for (const locale of ['en', 'pt-BR']) {
              const context = await browser.newContext();
              await preserveCleanup(
                async () => {
                  const escaped: string[] = [],
                    failures: string[] = [],
                    requests: string[] = [];
                  await context.route('**/*', async (route) => {
                    const url = new URL(route.request().url());
                    if (url.origin !== origin || !url.pathname.startsWith(`${prefix}/`)) {
                      escaped.push(url.origin + url.pathname);
                      await route.abort();
                    } else await route.continue();
                  });
                  await context.addInitScript((language) => {
                    if (!localStorage.getItem('rei.locale'))
                      localStorage.setItem('rei.locale', language);
                  }, locale);
                  const page = await context.newPage();
                  page.on('pageerror', (error) => failures.push(error.message));
                  page.on('request', (request) => requests.push(new URL(request.url()).pathname));
                  await page.goto(`${base}/places`);
                  await expect
                    .poll(() => new URL(page.url()).pathname)
                    .toBe(`${prefix}/places/sao-paulo-bela-vista`);
                  await expect
                    .poll(() => page.locator('.plate__name').textContent())
                    .toBe('Bela Vista');
                  await page.reload();
                  await expect
                    .poll(() => page.locator('.plate__name').textContent())
                    .toBe('Bela Vista');
                  await page
                    .getByRole('link', { name: locale === 'en' ? 'Search' : 'Buscar', exact: true })
                    .filter({ visible: true })
                    .first()
                    .click();
                  await expect
                    .poll(() => new URL(page.url()).pathname)
                    .toBe(`${prefix}/search/sao-paulo-bela-vista`);
                  const property = page.locator('a.prow').first();
                  await property.waitFor();
                  expect(await property.getAttribute('href')).toMatch(
                    new RegExp(`^${prefix}/properties/`),
                  );
                  await property.click();
                  await expect
                    .poll(() => new URL(page.url()).pathname)
                    .toMatch(new RegExp(`^${prefix}/properties/`));
                  await expect
                    .poll(() => page.locator('.property-source').count())
                    .toBeGreaterThan(0);
                  await page.reload();
                  await expect
                    .poll(() => page.locator('.property-source').count())
                    .toBeGreaterThan(0);
                  await page
                    .getByRole('link', {
                      name: locale === 'en' ? 'Back to Search' : 'Voltar à busca',
                    })
                    .click();
                  await expect
                    .poll(() => new URL(page.url()).pathname)
                    .toBe(`${prefix}/search/sao-paulo-bela-vista`);
                  await page.goto(`${base}/ask/sao-paulo-bela-vista`);
                  await page
                    .getByRole('textbox', {
                      name: locale === 'en' ? 'Question draft' : 'Rascunho da pergunta',
                    })
                    .waitFor();
                  await page
                    .getByRole('button', {
                      name: /Acompanhar o exemplo preparado|Follow the prepared example/,
                    })
                    .click();
                  await expect
                    .poll(() => page.locator('.ask-session-status').textContent())
                    .toContain(locale === 'en' ? 'Completed' : 'Concluída');
                  expect(requests).toContain(`${prefix}/api/v1/runs/${example!.runId}/events`);
                  await page
                    .getByRole('button', { name: locale === 'en' ? 'Português' : 'English' })
                    .filter({ visible: true })
                    .first()
                    .click();
                  await expect
                    .poll(() => page.locator('html').getAttribute('lang'))
                    .toBe(locale === 'en' ? 'pt-BR' : 'en');
                  expect(new URL(page.url()).pathname).toBe(`${prefix}/ask/sao-paulo-bela-vista`);
                  await page.reload();
                  await page.getByRole('textbox').waitFor();
                  await expect
                    .poll(() => page.locator('html').getAttribute('lang'))
                    .toBe(locale === 'en' ? 'pt-BR' : 'en');
                  await page.goto(`${base}/privacy`);
                  await expect.poll(() => page.locator('main h1').count()).toBe(1);
                  expect(requests.some((path) => path.startsWith(`${prefix}/assets/`))).toBe(true);
                  expect(escaped).toEqual([]);
                  expect(failures).toEqual([]);
                },
                () => context.close(),
              );
            }
          },
          () => browser.close(),
        );
      },
      () => fixture.down(),
    );
  });
}
