import type { Page } from 'playwright';
import { expect } from 'vitest';
import { parseListingResponse } from '../../packages/contracts/dist/index.js';
import type { ListingResponse, PropertyResponse } from '../../packages/contracts/dist/index.js';
import { displayedEvidenceLabel, displayedSourceName } from './api-labels.ts';
import { requestHttp } from './http.ts';
import { propertyMoney, readProperty } from './property-reads.ts';

export const preparedListingId = (suffix: number) =>
  `0199a3e0-0000-7000-8000-${String(suffix).padStart(12, '0')}`;

export async function readListing(base: string, id: string) {
  const response = await requestHttp(`${base}/api/v1/listings/${id}`);
  expect(response.status).toBe(200);
  const parsed = parseListingResponse(await response.json());
  expect(parsed.listing.id).toBe(id);
  return parsed;
}

export async function readListingContext(base: string, expected: ListingResponse) {
  const property = await readProperty(base, expected.listing.propertyId);
  const member = property.property.listings.find((listing) => listing.id === expected.listing.id);
  expect(member?.propertyId).toBe(expected.listing.propertyId);
  expect(member?.position).toBe(expected.listing.position);
  return property;
}

export function listingDate(instant: string, locale: 'pt-BR' | 'en') {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(instant));
}

/** Expected facts originate in separate parsed HTTP reads, never in rendered text. */
export async function checkListing(
  page: Page,
  expected: ListingResponse,
  property: PropertyResponse | undefined,
  locale: 'pt-BR' | 'en',
) {
  const listing = expected.listing;
  const navigation = page.locator('.public-tabs:visible, .public-rail-navigation:visible');
  await expect.poll(() => page.locator('.listing-head h1').textContent()).toBe(listing.street);
  const normalize = (text: string | null) => text?.replace(/\u00a0/g, ' ');
  expect(normalize(await page.locator('.listing-asking .fig__value').textContent())).toBe(
    propertyMoney(listing.askingPriceMinorUnits, locale, listing.askingPriceMinorUnits % 100 !== 0),
  );
  if (listing.pricePerSquareMeter !== null)
    expect(normalize(await page.locator('.listing-formula').textContent())).toContain(
      `${propertyMoney(listing.pricePerSquareMeter, locale)}/m²`,
    );
  const formula = page.locator('.listing-formula-details');
  expect(await formula.locator('summary').textContent()).toBe(
    locale === 'en' ? 'View public formula' : 'Ver fórmula pública',
  );
  await formula.locator('summary').click();
  expect(await formula.locator('p').isVisible()).toBe(true);
  expect(await formula.locator('p').textContent()).toContain(listing.pricePerSquareMeterFormula);
  expect(await formula.locator('p').textContent()).toContain(
    locale === 'en' ? 'minor units' : 'centavos',
  );
  await formula.locator('summary').click();
  const facts = page.locator('.listing-provenance');
  for (const fact of [
    displayedSourceName(listing.source, locale),
    listing.provenance.runId,
    listingDate(listing.firstCollectedAt, locale),
    listingDate(listing.lastCollectedAt, locale),
    String(listing.collectionCount),
  ])
    expect(await facts.textContent()).toContain(fact);
  expect(
    await facts
      .locator('dt')
      .filter({ hasText: locale === 'en' ? 'Retained snapshots' : 'Snapshots mantidos' })
      .locator('+ dd')
      .textContent(),
  ).toBe(locale === 'en' ? 'Not reported' : 'Não informado');
  const expiry = facts
    .locator('dt')
    .filter({ hasText: locale === 'en' ? 'Expires at' : 'Expira em' })
    .locator('+ dd');
  expect(await expiry.textContent()).toBe(
    listing.snapshot.expiresAt
      ? listingDate(listing.snapshot.expiresAt, locale)
      : locale === 'en'
        ? 'Not reported'
        : 'Não informado',
  );
  await facts.locator('details > summary').click();
  for (const fact of [
    listing.id,
    displayedEvidenceLabel(listing.fixtureLabel, locale),
    listing.provenance.snapshotId,
    listing.provenance.contentHash,
  ])
    expect(await facts.locator('details').textContent()).toContain(fact);
  expect(
    await facts
      .locator('details dt')
      .filter({
        hasText:
          locale === 'en' ? 'Synthetic evidence label' : 'Identificação da evidência sintética',
      })
      .locator('+ dd')
      .textContent(),
  ).toBe(displayedEvidenceLabel(listing.fixtureLabel, locale));
  expect(await facts.locator('details > .prov').textContent()).toContain(
    locale === 'en' ? 'prepared from persisted' : 'preparada de persistida',
  );
  await facts.locator('details > summary').click();
  const rows = page.locator('.listing-values tbody tr');
  expect(await rows.count()).toBe(8);
  const unknown = locale === 'en' ? 'Not reported' : 'Não informado';
  for (const [index, field] of (
    ['areaSquareMeters', 'bedrooms', 'bathrooms', 'parkingSpaces'] as const
  ).entries()) {
    const value = listing[field];
    expect(
      await rows
        .nth(index + 3)
        .locator('td')
        .first()
        .textContent(),
    ).toBe(
      value === null
        ? unknown
        : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}${field === 'areaSquareMeters' ? ' m²' : ''}`,
    );
    expect(
      await rows
        .nth(index + 3)
        .locator('time')
        .getAttribute('datetime'),
    ).toBe(listing.fieldEffectiveAt.attributes);
  }
  expect(await rows.first().locator('time').getAttribute('datetime')).toBe(
    listing.fieldEffectiveAt.askingPrice,
  );
  expect(await rows.last().locator('time').getAttribute('datetime')).toBe(
    listing.fieldEffectiveAt.description,
  );
  expect(await page.locator('.listing-events > li').count()).toBe(listing.history.length);
  const eventsNewestFirst = [...listing.history].sort(
    (left, right) => new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime(),
  );
  for (const [index, event] of eventsNewestFirst.entries()) {
    const row = page.locator('.listing-events > li').nth(index);
    expect(await row.locator(':scope > div > time').getAttribute('datetime')).toBe(
      event.effectiveAt,
    );
    if (event.type === 'price-changed')
      for (const value of [event.previousMinorUnits, event.currentMinorUnits])
        expect(normalize(await row.textContent())).toContain(propertyMoney(value, locale));
    if (event.type === 'created')
      expect(await row.locator(':scope > div > .small').textContent()).not.toContain('R$');
    if (event.type === 'description-changed') {
      const change = row.locator('details').first();
      await change.locator('summary').click();
      expect(await change.textContent()).toContain(event.beforeHash);
      expect(await change.textContent()).toContain(event.afterHash);
      await change.locator('summary').click();
    }
    const evidence = row.locator('details').last();
    await evidence.locator('summary').click();
    expect(await evidence.textContent()).toContain(event.provenance.snapshotId);
    expect(await evidence.textContent()).toContain(event.provenance.contentHash);
    await evidence.locator('summary').click();
  }
  if (listing.description.permission === 'allowed') {
    expect(await page.locator('.listing-description-text').first().textContent()).toBe(
      listing.description.current,
    );
    const comparison = page.locator('.listing-comparison');
    await comparison.locator('summary').click();
    expect(await comparison.locator('.rows > li').count()).toBe(
      listing.description.versions.length,
    );
    for (const [index, version] of listing.description.versions.entries()) {
      const row = comparison.locator('.rows > li').nth(index);
      expect(await row.locator('.listing-description-text').textContent()).toBe(version.text);
      expect(await row.locator('time').getAttribute('datetime')).toBe(version.effectiveAt);
      expect(await row.textContent()).toContain(version.contentHash);
    }
    await comparison.locator('summary').click();
  } else {
    expect(await page.locator('.listing-description').textContent()).toContain(
      locale === 'en' ? 'Description changed.' : 'Descrição alterada.',
    );
    expect(await page.locator('.listing-comparison, .listing-description-text').count()).toBe(0);
    expect(
      await page
        .locator('.listing-description li time')
        .evaluateAll((items) => items.map((item) => item.getAttribute('datetime'))),
    ).toEqual(listing.description.changedAt);
  }
  expect(
    await page.locator('.listing-description > .property-panel-body > a').getAttribute('href'),
  ).toBe(listing.description.sourceUrl);
  const member = property?.property.listings.find((item) => item.id === listing.id);
  const contextVerified =
    property?.property.summary.id === listing.propertyId &&
    member?.propertyId === listing.propertyId &&
    member.position === listing.position &&
    listing.position >= 1 &&
    listing.position <= property.property.listings.length;
  if (property && contextVerified) {
    const ancestry = page.locator('.property-ancestry');
    await ancestry.locator('summary').click();
    for (const place of property.property.summary.breadcrumbs) {
      const link = ancestry.getByRole('link', {
        name: locale === 'en' ? place.name.en : place.name.ptBR,
        exact: true,
      });
      expect(await link.isVisible()).toBe(true);
      expect(await link.getAttribute('href')).toBe(`/search/${place.id}`);
    }
    await ancestry.locator('summary').click();
    expect(await page.locator('.plate__over').textContent()).toContain(
      locale === 'en'
        ? `${listing.position} of ${property.property.listings.length}`
        : `${listing.position} de ${property.property.listings.length}`,
    );
    const neighborhood = property.property.summary.breadcrumbs.find(
      (place) => place.kind === 'neighborhood',
    );
    if (neighborhood)
      expect(
        await navigation
          .getByRole('link', { name: locale === 'en' ? 'Search' : 'Buscar' })
          .getAttribute('href'),
      ).toBe(`/search/${neighborhood.id}`);
  } else {
    expect(await page.locator('.plate__over').textContent()).not.toMatch(/\d+ (?:de|of) \d+/);
    expect(await page.locator('.property-location').count()).toBe(0);
    expect(await page.locator('.listing-context').textContent()).toContain(
      locale === 'en' ? 'not verified' : 'não verificados',
    );
    expect(
      await navigation
        .getByRole('link', { name: locale === 'en' ? 'Search' : 'Buscar' })
        .getAttribute('href'),
    ).toBe('/search');
  }
  expect(await navigation.locator('[aria-current="page"]').textContent()).toBe(
    locale === 'en' ? 'Search' : 'Buscar',
  );
  expect(
    await page
      .locator(
        '.place-navigation, .listing-details img, .listing-details script, .listing-details a[download]',
      )
      .count(),
  ).toBe(0);
}
