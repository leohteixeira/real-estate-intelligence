import type { Locator, Page } from 'playwright';
import { expect } from 'vitest';
import { checkAccessibility } from './accessibility.ts';

/** Exercise the native keyboard behavior, not merely the retained closed-disclosure DOM. */
export async function toggleOverviewDisclosure(page: Page, disclosure: Locator, open: boolean) {
  const summary = disclosure.locator(':scope > summary');
  await summary.scrollIntoViewIfNeeded();
  await summary.focus();
  expect(await summary.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
  const bounds = await summary.boundingBox();
  expect(bounds?.height).toBeGreaterThanOrEqual(44);
  expect(bounds?.width).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Enter');
  await expect
    .poll(() => disclosure.evaluate((element) => (element as HTMLDetailsElement).open))
    .toBe(open);
}

export async function exerciseOverviewDisclosures(
  page: Page,
  name: string,
  locale: 'pt-BR' | 'en',
) {
  const viewport = page.viewportSize()!;
  if (viewport.width >= 960) {
    const band = (await page.locator('.place-key-figures').boundingBox())!;
    expect(band.height, `${name} default figure band`).toBeLessThanOrEqual(
      viewport.width === 1440 ? 300 : 460,
    );
  }
  const monthBoxes = await page.locator('.place-chart__months time').evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
    })),
  );
  expect(monthBoxes.length).toBeGreaterThanOrEqual(3);
  for (const [index, box] of monthBoxes.entries())
    if (index)
      expect(
        box.left,
        `${name}: ${monthBoxes[index - 1]!.text} / ${box.text}`,
      ).toBeGreaterThanOrEqual(monthBoxes[index - 1]!.right + 4);
  const figures = page.locator('.place-key-figures .place-figure-evidence');
  expect(await figures.count()).toBe(7);
  for (const disclosure of await figures.all()) {
    expect(await disclosure.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(
      false,
    );
    expect(await disclosure.locator('.place-provenance').isVisible()).toBe(false);
    const summary = await disclosure.locator('summary').textContent();
    expect(summary).toContain(locale === 'en' ? 'Evidence' : 'Evidências');
    expect(summary).not.toMatch(/UTC|Computed|Calculada|Freshness|Atualidade/);
    expect(summary).toMatch(/\d/);
    await toggleOverviewDisclosure(page, disclosure, true);
    expect(await disclosure.locator('.place-provenance').isVisible()).toBe(true);
    const evidence = await disclosure.locator('.place-provenance').textContent();
    expect(evidence).toContain('UTC');
    expect(evidence).toMatch(
      locale === 'en'
        ? /contributing (property|properties|listing|listings)/
        : /(imóvel|imóveis|anúncio|anúncios) contribuint/,
    );
    expect(evidence).toMatch(
      locale === 'en'
        ? /Fresh data|Stale data|Freshness not tracked/
        : /Dados atuais|Dados desatualizados|Atualidade não rastreada/,
    );
    for (const link of await disclosure.locator('.place-provenance a').all()) {
      expect(await link.isVisible()).toBe(true);
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect((await link.boundingBox())?.width).toBeGreaterThanOrEqual(44);
      expect(await link.getAttribute('href')).toMatch(/^https?:\/\//);
    }
  }
  const table = page.locator('.place-series-disclosure');
  expect(await table.locator('table').isVisible()).toBe(false);
  await toggleOverviewDisclosure(page, table, true);
  expect(await table.locator('table').isVisible()).toBe(true);
  expect(await table.locator('tbody tr').count()).toBe(12);
  const points = table.locator('.place-point-evidence');
  expect(await points.count()).toBe(24);
  for (const point of await points.all()) {
    await toggleOverviewDisclosure(page, point, true);
    expect(await point.locator('.place-provenance').isVisible()).toBe(true);
    expect(await point.locator('.place-provenance').textContent()).toContain('UTC');
  }
  const neighbours = page.locator('.place-neighbour .place-figure-evidence');
  expect(await neighbours.count()).toBe((await page.locator('.place-neighbour').count()) * 2);
  for (const disclosure of await neighbours.all()) {
    await toggleOverviewDisclosure(page, disclosure, true);
    expect(await disclosure.locator('.place-provenance').isVisible()).toBe(true);
  }
  await checkAccessibility(page, `place-overview-expanded-${name}`);
  // Preserve the authored default chart-led / compact state for the normal captures.
  for (const point of await points.all()) await toggleOverviewDisclosure(page, point, false);
  await toggleOverviewDisclosure(page, table, false);
  for (const disclosure of [...(await figures.all()), ...(await neighbours.all())])
    await toggleOverviewDisclosure(page, disclosure, false);
  expect(
    await page
      .locator(
        '.place-key-figures details[open], .place-series details[open], .place-neighbours details[open]',
      )
      .count(),
  ).toBe(0);
}
