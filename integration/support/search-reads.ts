import type { Page } from 'playwright';
import { expect } from 'vitest';
import { parseSearchResponse } from '../../packages/contracts/dist/index.js';
import type { SearchQuery, SearchResponse } from '../../packages/contracts/dist/index.js';
import { requestHttp } from './http.ts';

export function searchParameters(query: SearchQuery) {
  return new URLSearchParams(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}
export async function readSearch(base: string, query: SearchQuery): Promise<SearchResponse> {
  const response = await requestHttp(`${base}/api/v1/properties?${searchParameters(query)}`);
  expect(response.status).toBe(200);
  return parseSearchResponse(await response.json());
}
export async function checkSearch(
  page: Page,
  base: string,
  query: SearchQuery,
  locale: 'pt-BR' | 'en',
) {
  const expected = await readSearch(base, query);
  const total = await readSearch(base, { placeId: query.placeId });
  await expect
    .poll(() => page.locator('.search-count').textContent())
    .toBe(
      locale === 'en'
        ? `${expected.totalItems} of ${total.totalItems} ${expected.totalItems === 1 ? 'property' : 'properties'}`
        : `${expected.totalItems} de ${total.totalItems} ${expected.totalItems === 1 ? 'imóvel' : 'imóveis'}`,
    );
  await checkSearchRows(page, expected, locale);
  return expected;
}
/** Compare each identifiable prepared row in server order, including cursor append readbacks. */
export async function checkSearchRows(
  page: Page,
  expected: SearchResponse,
  locale: 'pt-BR' | 'en',
) {
  await expect.poll(() => page.locator('.search-rows li').count()).toBe(expected.items.length);
  const english = locale === 'en';
  const quantity = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  const types = {
    apartment: english ? 'Apartment' : 'Apartamento',
    house: english ? 'House' : 'Casa',
    studio: english ? 'Studio' : 'Estúdio',
    commercial: english ? 'Commercial' : 'Comercial',
    land: english ? 'Land' : 'Terreno',
    condominium: english ? 'Condominium' : 'Condomínio',
    other: english ? 'Other' : 'Outro',
  };
  const amount = (minorUnits: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
      .format(minorUnits / 100)
      .replace(/\s/g, ' ')
      .replace(/^R\$\s*/, 'R$ ');
  if (expected.medianPricePerSquareMeter !== null) {
    const figure = amount(expected.medianPricePerSquareMeter);
    await expect
      .poll(async () =>
        (await page.locator('.search-median .fig__value').textContent())?.replace(/\s/g, ' '),
      )
      .toBe(`${figure} /m²`);
  } else
    expect(await page.locator('.search-median .fig__value').textContent()).toBe(
      english ? 'Median not available' : 'Mediana não disponível',
    );
  for (const [index, property] of expected.items.entries()) {
    const row = page.locator('.search-rows li').nth(index);
    const bedrooms =
      property.bedrooms === null
        ? english
          ? 'Bedrooms unavailable'
          : 'Quartos não disponíveis'
        : `${property.bedrooms} ${english ? (property.bedrooms === 1 ? 'bedroom' : 'bedrooms') : property.bedrooms === 1 ? 'quarto' : 'quartos'}`;
    const area =
      property.areaSquareMeters === null
        ? english
          ? 'Area unavailable'
          : 'Área não disponível'
        : `${quantity(property.areaSquareMeters)} m²`;
    await expect
      .poll(() => row.locator('.prow__t').textContent())
      .toBe(`${types[property.propertyType]} · ${bedrooms} · ${area}`);
    expect(await row.locator('.prow__s').textContent()).toBe(property.place.name.ptBR);
    await expect
      .poll(async () => (await row.locator('.prow__p').textContent())?.replace(/\s/g, ' '))
      .toBe(
        property.askingPrice
          ? amount(property.askingPrice.minorUnits)
          : english
            ? 'Asking price unavailable'
            : 'Preço pedido não disponível',
      );
    expect((await row.locator('.prow__r').textContent())?.replace(/\s/g, ' ')).toBe(
      property.pricePerSquareMeter === null
        ? english
          ? 'Price per m² unavailable'
          : 'Preço por m² não disponível'
        : `${amount(property.pricePerSquareMeter)} /m²`,
    );
    const movement = row.locator('.prow__comparison');
    if (property.belowMedianPercent === null) expect(await movement.count()).toBe(0);
    else
      expect(await movement.textContent()).toBe(
        property.belowMedianPercent === 0
          ? english
            ? 'At the median'
            : 'Na mediana'
          : `${quantity(Math.abs(property.belowMedianPercent))}% ${english ? (property.belowMedianPercent > 0 ? 'below median' : 'above median') : property.belowMedianPercent > 0 ? 'abaixo da mediana' : 'acima da mediana'}`,
      );
    expect(await row.locator('a.prow').count()).toBe(1);
    const href = await row.locator('a.prow').getAttribute('href');
    expect(href).toContain(`/properties/${property.id}?returnTo=`);
  }
}
