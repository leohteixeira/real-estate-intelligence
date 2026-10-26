import type { Page } from 'playwright';
import { expect } from 'vitest';
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
      locale === 'en' ? 'not been submitted or executed' : 'não foi enviada nem executada',
    );
    expect(
      await page.evaluate(() => Object.keys(localStorage).filter((key) => key !== 'rei.locale')),
    ).toEqual([]);
  } finally {
    await page.unroute(seriesUrl);
  }
}
