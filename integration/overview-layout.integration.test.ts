import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
import { preserveCleanup } from './support/cleanup.ts';
import { chartMonthTicks } from '../apps/web/src/places/series-presentation.ts';
import { resources } from '../apps/web/src/places/resources.ts';

it('lays out all seven default figures compactly without reducing type or clipping evidence controls', async () => {
  const styles = await Promise.all(
    ['tokens', 'components', 'place'].map((name) =>
      readFile(new URL(`../apps/web/src/styles/${name}.css`, import.meta.url), 'utf8'),
    ),
  );
  const fonts = await Promise.all([
    readFile(
      new URL(
        '../apps/web/node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2',
        import.meta.url,
      ),
    ),
    readFile(
      new URL(
        '../apps/web/node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff2',
        import.meta.url,
      ),
    ),
  ]);
  const browserEnv = { ...process.env };
  delete browserEnv.DISPLAY;
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, env: browserEnv });
  await preserveCleanup(
    async () => {
      for (const locale of ['pt-BR', 'en'] as const) {
        const copy = resources[locale].place;
        // Static typography/layout specimen, not a substituted API response or market calculation.
        const evidence = (origin: string, count: string) =>
          `<p class="place-origin">${origin}</p><details class="place-figure-evidence"><summary>${copy.figureEvidence} · ${count}</summary><p class="place-origin">${copy.prepared}</p><div class="prov place-provenance"><span>2026-10-12 12:00 UTC</span><a href="https://synthetic.invalid/one">Full canonical source</a></div></details>`;
        const secondary = [
          [copy.movement, '+3.1%', '', '2,000'],
          [copy.days, `90 <small>${copy.daysUnit}</small>`, '', '2,000'],
          [
            copy.reductions30,
            `250 <small>${copy.listingsUnit}</small>`,
            `<p class="small">10% ${locale === 'en' ? 'of active listings' : 'dos anúncios ativos'}</p>`,
            '2,500',
          ],
          [copy.ratio, '1.25', '', '2,000'],
          [
            `${copy.sale} <span class="tag tag--sale">${locale === 'en' ? 'Sale' : 'Venda'}</span>`,
            copy.noneAvailable,
            `<p class="small">${copy.saleReason}</p>`,
            '0',
          ],
        ]
          .map(
            ([label, value, extra, count], index) =>
              `<div class="fig fig--s"><h2 class="fig__label">${label}</h2><p class="${index === 4 ? 'place-figure-unavailable' : 'fig__value'}">${value}</p>${index === 4 ? '' : extra}${evidence(copy.preparedCompact, `${count} ${index === 2 ? copy.listingsUnit : locale === 'en' ? 'properties' : 'imóveis'}`)}</div>`,
          )
          .join('');
        for (const width of [390, 960, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          await preserveCleanup(
            async () => {
              await page.setContent(`<style>${styles.join('\n')} @font-face { font-family: Barlow; font-weight: 400; src: url(data:font/woff2;base64,${fonts[0]!.toString('base64')}); } @font-face { font-family: 'Barlow Condensed'; font-weight: 600; src: url(data:font/woff2;base64,${fonts[1]!.toString('base64')}); }</style><div class="rei place-app"><aside class="place-rail"></aside><div class="place-main" style="flex:1"><div class="place-body"><div class="place-key-figures">
          <section class="band place-median"><div class="fig"><h2 class="fig__label">${copy.median} <span class="tag">${copy.asking}</span></h2><p class="fig__value">R$ 9.515 <small>/m²</small></p>${evidence(copy.liveCompact, locale === 'en' ? '1 property' : '1 imóvel')}</div></section>
          <section class="band place-parent"><div class="fig fig--s"><h2 class="fig__label"><a href="/places/parent">${copy.parentMedian.replace('{{name}}', 'Centro')}</a><span class="tag">${copy.asking}</span></h2><p class="fig__value">R$ 9.515 <small>/m²</small></p>${evidence(copy.liveCompact, locale === 'en' ? '1 property' : '1 imóvel')}</div></section>
          <div class="band figs place-secondary">${secondary}</div></div></div></div></div>`);
              await page.evaluate(() => document.fonts.ready);
              expect(await page.locator('.place-key-figures .fig').count()).toBe(7);
              expect(await page.locator('.place-key-figures details[open]').count()).toBe(0);
              expect(
                await page
                  .locator('.place-median .fig__value')
                  .evaluate((element) => getComputedStyle(element).fontSize),
              ).toBe('48px');
              expect(
                await page
                  .locator('.place-secondary .fig__value')
                  .first()
                  .evaluate((element) => getComputedStyle(element).fontSize),
              ).toBe('28px');
              for (const summary of await page.locator('.place-key-figures summary').all()) {
                expect(await summary.isVisible()).toBe(true);
                expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
                expect((await summary.boundingBox())!.width).toBeGreaterThanOrEqual(44);
              }
              const band = (await page.locator('.place-key-figures').boundingBox())!;
              if (width >= 960)
                expect(band.height, `${locale} ${width} compact band`).toBeLessThanOrEqual(
                  width === 1440 ? 300 : 460,
                );
              expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
            },
            () => page.close(),
          );
        }
      }
    },
    () => browser.close(),
  );
});

it('keeps chronological localized chart tick boxes distinct at every supported width', async () => {
  const styles = await Promise.all(
    ['tokens', 'components', 'place'].map((name) =>
      readFile(new URL(`../apps/web/src/styles/${name}.css`, import.meta.url), 'utf8'),
    ),
  );
  const font = await readFile(
    new URL(
      '../apps/web/node_modules/@fontsource/barlow/files/barlow-latin-400-normal.woff2',
      import.meta.url,
    ),
  );
  const browserEnv = { ...process.env };
  delete browserEnv.DISPLAY;
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, env: browserEnv });
  await preserveCleanup(
    async () => {
      for (const locale of ['pt-BR', 'en'] as const) {
        for (const width of [390, 960, 1440]) {
          const page = await browser.newPage({ viewport: { width, height: 900 } });
          await preserveCleanup(
            async () => {
              const months = [
                '2025-11',
                '2025-12',
                '2026-01',
                '2026-02',
                '2026-03',
                '2026-04',
                '2026-05',
                '2026-06',
                '2026-07',
                '2026-08',
                '2026-09',
                '2026-10',
              ];
              const ticks = chartMonthTicks(months, locale);
              await page.setContent(`<style>${styles.join('\n')} @font-face { font-family: Barlow; font-weight: 400; src: url(data:font/woff2;base64,${font.toString('base64')}); }</style>
            <div class="rei place-app"><aside class="place-rail"></aside><div class="place-main" style="flex:1"><div class="place-body"><div class="place-overview-panels">
            <section class="panel place-series"><figure class="place-chart"><div class="place-chart__frame"><div class="place-chart__prices"><span>${locale === 'en' ? 'R$ 17,827.75' : 'R$ 17.827,75'}</span><span>R$ 8.000,00</span></div><svg viewBox="0 0 480 180"></svg><div class="place-chart__months">${ticks.map(({ index, month, label }) => `<time datetime="${month}" style="grid-column:${index + 1}">${label}</time>`).join('')}</div></div></figure></section><section class="panel place-neighbours">Neighbours</section>
            </div></div></div></div>`);
              await page.evaluate(() => document.fonts.ready);
              const times = page.locator('.place-chart__months time');
              expect(await times.count()).toBeGreaterThanOrEqual(3);
              expect(await times.first().getAttribute('datetime')).toBe(months[0]);
              expect(await times.last().getAttribute('datetime')).toBe(months[11]);
              const boxes = await times.evaluateAll((elements) =>
                elements.map((element) => ({
                  month: element.getAttribute('datetime'),
                  text: element.textContent,
                  x: element.getBoundingClientRect().x,
                  right: element.getBoundingClientRect().right,
                  height: element.getBoundingClientRect().height,
                })),
              );
              for (const [index, box] of boxes.entries()) {
                expect(box.text).not.toBe(box.month);
                expect(box.height).toBeGreaterThan(0);
                if (index)
                  expect(
                    box.x,
                    `${locale} ${width}: ${boxes[index - 1]!.text} / ${box.text}`,
                  ).toBeGreaterThanOrEqual(boxes[index - 1]!.right + 4);
              }
              expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
            },
            () => page.close(),
          );
        }
      }
    },
    () => browser.close(),
  );
});

it('wraps the complete overview question label at every authored width without clipping', async () => {
  const styles = await Promise.all(
    ['tokens', 'components', 'place'].map((name) =>
      readFile(new URL(`../apps/web/src/styles/${name}.css`, import.meta.url), 'utf8'),
    ),
  );
  const font = await readFile(
    new URL(
      '../apps/web/node_modules/@fontsource/barlow/files/barlow-latin-600-normal.woff2',
      import.meta.url,
    ),
  );
  const browserEnv = { ...process.env };
  delete browserEnv.DISPLAY;
  const browser = await chromium.launch({ headless: true, chromiumSandbox: true, env: browserEnv });
  await preserveCleanup(
    async () => {
      for (const width of [390, 960, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        await preserveCleanup(
          async () => {
            await page.setContent(`<style>${styles.join('\n')}
          @font-face { font-family: Barlow; font-weight: 600; src: url(data:font/woff2;base64,${font.toString('base64')}); }
        </style><div class="rei place-app"><aside class="place-rail"></aside><div class="place-main">
          <header class="shell place-head"><div class="place-head__content">
            <div class="plate place-plate"><div class="plate__in"><h1 class="plate__name">Bela Vista</h1></div></div>
            <div class="place-question-region"><form class="ask place-question"><label for="question">Pergunte sobre ${'Bairro'.repeat(100)}</label>
              <div class="ask__box"><input id="question" required><button>Continuar</button></div>
              <p class="small">A pergunta continua como rascunho.</p>
            </form></div>
          </div></header>
          <div class="prov"><span class="prov__sources"><span><a href="https://synthetic.invalid/one">Fontes: Fonte canônica completa</a></span><span><span class="prov__separator">, </span><a href="https://synthetic.invalid/two">Outra fonte canônica completa</a></span></span></div>
          <div class="place-overview-panels"><section class="panel place-series">Monthly series</section><section class="panel place-neighbours">Neighbours</section></div>
          </div></div>`);
            await page.evaluate(() => document.fonts.ready);
            const geometry = await page.evaluate(() => ({
              width: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              overflowing: [
                ...document.querySelectorAll<HTMLElement>('.place-question, .place-question label'),
              ]
                .filter((element) => element.scrollWidth > element.clientWidth)
                .map((element) => ({
                  tag: element.tagName,
                  className: element.className,
                  scrollWidth: element.scrollWidth,
                  clientWidth: element.clientWidth,
                })),
              labelHeight: document.querySelector('label')!.getBoundingClientRect().height,
              overflow: getComputedStyle(document.querySelector('label')!).overflow,
            }));
            expect(geometry).toMatchObject({
              width,
              scrollWidth: width,
              overflowing: [],
              overflow: 'visible',
            });
            expect(geometry.labelHeight).toBeGreaterThan(44);
            const questionStyle = await page
              .locator('.place-question-region')
              .evaluate((element) => ({
                background: getComputedStyle(element).backgroundColor,
                color: getComputedStyle(element).color,
              }));
            expect(questionStyle).toEqual(
              width === 390
                ? { background: 'rgb(244, 246, 249)', color: 'rgb(16, 27, 51)' }
                : { background: 'rgba(0, 0, 0, 0)', color: 'rgb(255, 255, 255)' },
            );
            expect((await page.locator('input').boundingBox())!.width).toBeGreaterThan(
              (await page.locator('button').boundingBox())!.width,
            );
            const links = page.locator('.prov__sources a');
            expect(await links.allTextContents()).toEqual([
              'Fontes: Fonte canônica completa',
              'Outra fonte canônica completa',
            ]);
            for (const link of await links.all()) {
              expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
              expect((await link.boundingBox())!.width).toBeGreaterThanOrEqual(44);
            }
            if (width === 1440) {
              const first = (await links.nth(0).boundingBox())!;
              expect(
                (await links.nth(1).boundingBox())!.x - (first.x + first.width),
              ).toBeGreaterThan(4);
            }
            if (width >= 960)
              expect(
                await page
                  .locator('.place-overview-panels')
                  .evaluate((element) => getComputedStyle(element).alignItems),
              ).toBe('start');
          },
          () => page.close(),
        );
      }
    },
    () => browser.close(),
  );
});
