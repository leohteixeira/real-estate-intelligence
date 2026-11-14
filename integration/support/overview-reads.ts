import type { Page } from 'playwright';
import { expect } from 'vitest';
import {
  parsePlaceMarketResponse,
  parsePlaceMarketSeriesResponse,
} from '../../packages/contracts/dist/index.js';
import { checkAccessibility } from './accessibility.ts';
import { toggleOverviewDisclosure } from './overview-disclosures.ts';

/** Exact owned transport faults; recovery always reaches the actual API. No business DTO is mocked. */
export async function exerciseOverviewReads(
  page: Page,
  base: string,
  width: number,
  locale: 'pt-BR' | 'en',
  captures: URL,
) {
  const id = 'sao-paulo-bela-vista';
  const url = `${base}/places/${id}`;
  const seriesUrl = `${base}/api/v1/places/${id}/market/monthly-series`;
  const retry = locale === 'en' ? 'Try again' : 'Tentar de novo';
  const draft = '<img src=x> São Paulo 🏘';
  let attempts = 0;
  await page.route(seriesUrl, async (route) => {
    attempts++;
    if (attempts === 1)
      await route.fulfill({ status: 503, body: 'private monthly-series failure' });
    else await route.continue();
  });
  try {
    await page.goto(url);
    const series = page.locator('.place-series');
    await expect.poll(() => series.getByRole('alert').count()).toBe(1);
    await expect
      .poll(() => page.locator('.place-median .fig__value').textContent())
      .toContain(locale === 'en' ? 'R$ 9,515' : 'R$ 9.515');
    const question = page.locator('.place-question input');
    await question.fill(draft);
    const button = series.getByRole('button', { name: retry, exact: true });
    await button.focus();
    expect(await button.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    expect(attempts).toBe(1);
    expect(await series.textContent()).not.toContain('private monthly-series failure');
    await page.keyboard.press('Enter');
    await expect.poll(() => series.locator('tbody tr').count()).toBe(12);
    const table = series.locator('.place-series-disclosure');
    await toggleOverviewDisclosure(page, table, true);
    expect(await table.locator('table').isVisible()).toBe(true);
    expect(await table.locator('tbody tr').count()).toBe(12);
    await toggleOverviewDisclosure(page, table, false);
    expect(await question.inputValue()).toBe(draft);
    expect(attempts).toBe(2);
    await checkAccessibility(page, `place-overview-recovered-${width}-${locale}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: new URL(`place-overview-recovered-${width}-${locale}.png`, captures).pathname,
      fullPage: true,
    });
    await page.locator('.place-question button').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.url()).toBe(`${base}/ask/${id}`);
    const incoming = page.getByRole('textbox', {
      name: locale === 'en' ? 'Question draft' : 'Rascunho da pergunta',
      exact: true,
    });
    await expect.poll(() => incoming.inputValue()).toBe(draft);
    expect(await incoming.isEditable()).toBe(true);
    expect(await page.locator('.ask-composer img').count()).toBe(0);
    expect(await page.locator('#ask-draft-hint').textContent()).toContain(
      locale === 'en'
        ? 'Submit a question for a real run.'
        : 'Envie uma pergunta para execução real.',
    );
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== 'rei.locale')),
    ).toEqual([]);
  } finally {
    await page.unroute(seriesUrl);
  }
}

/** Persisted historical values and evidence agree with public HTTP at every browser viewport. */
export async function exerciseHistoricalSeries(page: Page, base: string, locale: 'pt-BR' | 'en') {
  const id = 'sao-paulo-vila-mariana';
  const seriesRead = page.waitForResponse(`${base}/api/v1/places/${id}/market/monthly-series`);
  await page.goto(`${base}/places/${id}`);
  const panel = page.locator('.place-series');
  await panel.locator('.place-series-disclosure > summary').waitFor({ state: 'visible' });
  const response = await seriesRead;
  expect(response.status()).toBe(200);
  const series = parsePlaceMarketSeriesResponse(await response.json());
  expect(series.basis).toBe('event-fed-place-figures');
  if (series.basis !== 'event-fed-place-figures')
    throw new Error('Expected persisted monthly series.');
  expect(
    series.points.some((point, index) => index < 11 && point.median.value?.minorUnits === 300000),
  ).toBe(true);
  expect(series.points.at(-1)!.median.value?.minorUnits).toBe(450000);
  expect(await panel.locator(':scope > .place-origin').textContent()).toBe(
    locale === 'en'
      ? 'Figure computed from collected events'
      : 'Indicador calculado a partir dos eventos coletados',
  );
  expect(await panel.locator('svg').getAttribute('aria-label')).toContain(
    locale === 'en' ? 'Historical series' : 'Série histórica',
  );
  expect(await panel.locator('.place-chart__subject').count()).toBe(1);
  expect(await panel.locator('.place-chart__endpoint--subject').count()).toBe(2);
  await toggleOverviewDisclosure(page, panel.locator('.place-series-disclosure'), true);
  const rows = panel.locator('tbody tr');
  expect(await rows.count()).toBe(12);
  const formatTime = (instant: string) =>
    new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
      timeZoneName: 'short',
    }).format(new Date(instant));
  for (const [index, point] of series.points.entries()) {
    const row = rows.nth(index);
    expect(await row.locator('th').textContent()).toBe(point.month);
    for (const [column, median] of [point.median, point.parentMedian].entries()) {
      if (!median) continue;
      const cell = row.locator('td').nth(column);
      const expected =
        median.value === null
          ? locale === 'en'
            ? 'Not available'
            : 'Não disponível'
          : `${new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
              style: 'currency',
              currency: 'BRL',
              maximumFractionDigits: 0,
              minimumFractionDigits: 0,
            })
              .format(median.value.minorUnits / 100)
              .replace(/\u00a0/g, ' ')
              .replace(/^R\$\s*/, 'R$ ')} /m²`;
      expect(await cell.locator(':scope > .num').textContent()).toBe(expected);
      const proof = cell.locator('.place-point-evidence');
      await toggleOverviewDisclosure(page, proof, true);
      expect(await proof.locator('.place-month-cutoff').textContent()).toBe(
        `${locale === 'en' ? 'Population as of' : 'População até'} ${formatTime(point.asOf)}`,
      );
      expect(await proof.locator('.place-month-cutoff time').getAttribute('datetime')).toBe(
        point.asOf,
      );
      expect(await proof.locator('.place-provenance').textContent()).toContain(
        `${locale === 'en' ? 'Computed at' : 'Calculada em'} ${formatTime(median.computedAt)}`,
      );
      expect(await proof.locator('.place-provenance').textContent()).toContain(
        locale === 'en' ? 'Freshness not tracked' : 'Atualidade não rastreada',
      );
      expect(
        await proof
          .locator('.place-provenance a')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
      ).toEqual(median.sources.map((source) => source.url));
      expect(await proof.locator('.place-provenance').textContent()).toContain(
        locale === 'en'
          ? `${median.recordCount} contributing ${median.recordCount === 1 ? 'property' : 'properties'}`
          : `${median.recordCount} ${new Intl.PluralRules(locale).select(median.recordCount) === 'one' ? 'imóvel contribuinte' : 'imóveis contribuintes'}`,
      );
      await toggleOverviewDisclosure(page, proof, false);
    }
  }
  await checkAccessibility(page, `place-historical-series-${page.viewportSize()!.width}-${locale}`);
}

/** Controlled UI boundary: a strictly valid stale response; recovery returns to the actual API. */
export async function exerciseStaleEvidence(page: Page, base: string, locale: 'pt-BR' | 'en') {
  const id = 'sao-paulo-bela-vista';
  const endpoint = `${base}/api/v1/places/${id}/market`;
  let intercepted = 0;
  await page.route(endpoint, async (route) => {
    const response = await route.fetch();
    const real = parsePlaceMarketResponse(await response.json());
    const stale = structuredClone(real);
    const evaluated = Date.parse(stale.evaluatedAt);
    const median = stale.figures.medianAskingPricePerSquareMeter;
    const synthetic = {
      ...stale,
      figures: {
        ...stale.figures,
        medianAskingPricePerSquareMeter: {
          ...median,
          computedAt: new Date(evaluated - 1_234_500).toISOString(),
          freshness: {
            status: 'stale',
            latestCollectionCompletedAt: new Date(evaluated - 1000).toISOString(),
            ageSeconds: 1234.5,
          },
        },
      },
    };
    const valid = parsePlaceMarketResponse(synthetic);
    expect(valid.figures.medianAskingPricePerSquareMeter.value).toEqual(median.value);
    expect(valid.figures.medianAskingPricePerSquareMeter.sources).toEqual(median.sources);
    intercepted++;
    await route.fulfill({ response, json: valid });
  });
  try {
    await page.goto(`${base}/places/${id}`);
    const disclosure = page.locator('.place-median .place-figure-evidence');
    await disclosure.locator('summary').waitFor({ state: 'visible' });
    await toggleOverviewDisclosure(page, disclosure, true);
    const proof = disclosure.locator('.place-provenance');
    const age =
      locale === 'en' ? 'Calculation age: 1,234.5 seconds' : 'Idade do cálculo: 1.234,5 segundos';
    await expect.poll(() => proof.textContent()).toContain(age);
    expect(await proof.textContent()).toContain(
      locale === 'en' ? 'Stale data' : 'Dados desatualizados',
    );
    expect(await proof.textContent()).toContain('UTC');
    expect(await proof.textContent()).toMatch(
      locale === 'en' ? /contributing property/ : /imóvel contribuinte/,
    );
    expect(await proof.locator('a').count()).toBe(1);
    expect(await proof.locator('a').isVisible()).toBe(true);
    expect(intercepted).toBe(1);
    await checkAccessibility(page, `place-stale-evidence-${page.viewportSize()!.width}-${locale}`);
    await toggleOverviewDisclosure(page, disclosure, false);
  } finally {
    await page.unroute(endpoint);
  }
  await page.goto(`${base}/places/${id}`);
  const disclosure = page.locator('.place-median .place-figure-evidence');
  await disclosure.locator('summary').waitFor({ state: 'visible' });
  await toggleOverviewDisclosure(page, disclosure, true);
  expect(await disclosure.locator('.place-provenance').textContent()).not.toContain(
    locale === 'en' ? 'Calculation age:' : 'Idade do cálculo:',
  );
  await toggleOverviewDisclosure(page, disclosure, false);
}
