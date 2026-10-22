import type { Page } from 'playwright';
import { expect } from 'vitest';
import { parsePropertyResponse } from '../../packages/contracts/dist/index.js';
import type { PropertyResponse } from '../../packages/contracts/dist/index.js';
import { requestHttp } from './http.ts';

export const preparedPropertyId = (suffix: number) =>
  `0199a3e0-0000-7000-8000-${String(suffix).padStart(12, '0')}`;

export async function readProperty(base: string, id: string): Promise<PropertyResponse> {
  const response = await requestHttp(`${base}/api/v1/properties/${id}`);
  expect(response.status).toBe(200);
  const parsed = parsePropertyResponse(await response.json());
  expect(parsed.property.summary.id).toBe(id);
  return parsed;
}

export function propertyDate(instant: string, locale: 'pt-BR' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(instant));
}

export function propertyMoney(minor: number, locale: 'pt-BR' | 'en', exact = true) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: exact ? 2 : 0,
    maximumFractionDigits: exact ? 2 : 0,
  })
    .format(minor / 100)
    .replace(/\u00a0/g, ' ')
    .replace(/^R\$\s*/, 'R$ ');
}

/** Every comparison uses an independently parsed real HTTP response, not rendered fixture text. */
export async function checkProperty(
  page: Page,
  expected: PropertyResponse,
  locale: 'pt-BR' | 'en',
) {
  await expect
    .poll(() => page.locator('.property-source').count())
    .toBe(expected.property.listings.length);
  const { summary, listings, priceChanges, preparedEvidence, featureAgreement } = expected.property;
  const street = preparedEvidence.reasons.find(
    (reason) => reason.type === 'attribute-agreement' && reason.field === 'street',
  );
  expect(await page.locator('.property-head h1').textContent()).toBe(
    street?.type === 'attribute-agreement' && typeof street.value === 'string'
      ? street.value
      : summary.place.name.ptBR,
  );
  const price = page.locator('.property-prices');
  const normalize = (value: string | null) => value?.replace(/\u00a0/g, ' ');
  if (summary.askingPrice) {
    expect(normalize(await price.locator('.fig__value').textContent())).toBe(
      propertyMoney(
        summary.askingPrice.minorUnits,
        locale,
        summary.askingPrice.minorUnits % 100 !== 0,
      ),
    );
    expect(await price.locator('.property-price-provenance a').textContent()).toBe(
      listings.find((listing) => listing.id === summary.askingPrice?.listingId)?.source.label,
    );
    expect(await price.textContent()).toContain(
      propertyDate(summary.askingPrice.provenance.observedAt, locale),
    );
  } else
    expect(await price.textContent()).toContain(
      locale === 'en' ? 'Asking price unavailable' : 'Preço pedido não disponível',
    );
  if (summary.pricePerSquareMeter !== null)
    expect(normalize(await price.locator('.property-per-meter').textContent())).toBe(
      `${propertyMoney(summary.pricePerSquareMeter, locale)} /m²`,
    );
  expect(await price.textContent()).toContain(
    locale === 'en' ? 'No recorded sale' : 'Nenhuma venda registrada',
  );
  expect(await page.locator('.life__track').count()).toBe(listings.length);
  expect(await page.locator('.property-reasons > li').count()).toBe(
    preparedEvidence.reasons.length,
  );
  expect(await page.locator('.property-price-events > li').count()).toBe(priceChanges.length);
  if (preparedEvidence.reasons.length)
    await page.locator('.property-reason-details > summary').click();
  for (const [index, reason] of preparedEvidence.reasons.entries()) {
    const row = page.locator('.property-reasons > li').nth(index);
    const ids =
      reason.type === 'published-neighborhood-disagreement'
        ? reason.values.map((value) => value.listingId)
        : reason.listingIds;
    expect(await row.locator('.bar i').evaluate((bar) => (bar as HTMLElement).style.width)).toBe(
      `${(ids.length / listings.length) * 100}%`,
    );
    expect(
      await page
        .locator('.property-reason-details > ol > li')
        .nth(index)
        .locator('a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    ).toEqual(ids.map((id) => `#property-listing-${id}`));
    if (reason.type === 'published-neighborhood-disagreement')
      for (const value of reason.values) {
        expect(await row.textContent()).toContain(value.neighborhood);
        expect(await row.textContent()).toContain(
          listings.find((listing) => listing.id === value.listingId)?.source.label,
        );
      }
    if (reason.type === 'attribute-agreement' && typeof reason.value === 'number')
      expect(await row.textContent()).toContain(new Intl.NumberFormat(locale).format(reason.value));
  }
  if (preparedEvidence.reasons.length)
    await page.locator('.property-reason-details > summary').click();
  for (const change of priceChanges) {
    const event = page
      .locator('.property-price-events li')
      .filter({ has: page.locator(`time[datetime="${change.effectiveAt}"]`) });
    expect(normalize(await event.textContent())).toContain(
      propertyMoney(change.currentMinorUnits, locale),
    );
    expect(normalize(await event.textContent())).toContain(
      propertyMoney(change.previousMinorUnits, locale),
    );
    expect(await event.textContent()).toContain(propertyDate(change.effectiveAt, locale));
  }
  for (const listing of listings) {
    const evidence = page.locator(`#property-listing-${listing.id}`);
    const disclosure = page.locator('.property-source-disclosure').filter({ has: evidence });
    await disclosure.locator(':scope > summary').click();
    expect(await evidence.isVisible()).toBe(true);
    expect(await evidence.textContent()).toContain(listing.source.label);
    expect(await evidence.textContent()).toContain(propertyDate(listing.firstCollectedAt, locale));
    expect(await evidence.textContent()).toContain(propertyDate(listing.lastCollectedAt, locale));
    expect(await evidence.textContent()).toContain(String(listing.collectionCount));
    await disclosure.locator(':scope > summary').click();
  }
  await page.locator('.property-feature-details > summary').click();
  for (const feature of featureAgreement) {
    const index = featureAgreement.indexOf(feature);
    const row = page.locator('.property-feature-list > li').nth(index);
    expect(await row.textContent()).toContain(`${feature.reportingCount}`);
    expect(await row.textContent()).toContain(
      `${new Intl.NumberFormat(locale).format(feature.reportingPercent)}%`,
    );
    const reporters = listings.filter((listing) => feature.listingIds.includes(listing.id));
    const nonReporters = listings.filter((listing) => !feature.listingIds.includes(listing.id));
    const details = page.locator('.property-feature-source').nth(index);
    expect(await details.locator('p').nth(0).textContent()).toContain(
      reporters.map((listing) => listing.source.label).join(' · '),
    );
    expect(await details.locator('p').nth(1).textContent()).toContain(
      nonReporters.map((listing) => listing.source.label).join(' · ') || '—',
    );
  }
  await page.locator('.property-feature-details > summary').click();
  expect(await page.locator('.property-details img, .property-details a[download]').count()).toBe(
    0,
  );
}
