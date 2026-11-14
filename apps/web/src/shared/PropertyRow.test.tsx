// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { createLocale } from '../places/locale';
import type { Locale } from '../places/locale';
import type { PropertySort } from '@rei/contracts';
import { PropertyRow } from './PropertyRow';
import { property } from './shared-fixtures.test';
afterEach(cleanup);
function mount(
  overrides: Partial<typeof property> = {},
  locale: Locale = 'en',
  sortedBy?: PropertySort,
) {
  return render(
    <I18nextProvider i18n={createLocale(locale)}>
      <MemoryRouter
        basename="/real-estate-intelligence"
        initialEntries={['/real-estate-intelligence/']}
      >
        <PropertyRow
          property={{ ...property, ...overrides }}
          href="/properties/owned-property?returnTo=%2Fsearch%2Fplace"
          {...(sortedBy ? { sortedBy } : {})}
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
}
it.each(['pt-BR', 'en'] as const)(
  'shows contract values and a single native destination in %s',
  async (locale) => {
    mount({}, locale);
    const link = screen.getByRole('link');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    // The published base path is the router's, exactly as for every other internal link.
    expect(link).toHaveAttribute(
      'href',
      '/real-estate-intelligence/properties/owned-property?returnTo=%2Fsearch%2Fplace',
    );
    expect(link).toHaveTextContent(
      locale === 'en' ? 'Rua Bela — block 1200–1298' : 'Rua Bela — 1200–1298',
    );
    expect(link).not.toHaveTextContent(
      locale === 'en' ? 'Rua Bela — 1200–1298' : 'Rua Bela — block 1200–1298',
    );
    expect(link).not.toHaveTextContent('Never an address');
    expect(link).toHaveTextContent(locale === 'en' ? 'R$ 628,000' : 'R$ 628.000');
    expect(link).toHaveTextContent(locale === 'en' ? 'R$ 9,515 /m²' : 'R$ 9.515 /m²');
    expect(link).toHaveTextContent(
      locale === 'en' ? '3.1% below median' : '3,1% abaixo da mediana',
    );
    expect(link).toHaveTextContent(locale === 'en' ? '2 bedrooms' : '2 quartos');
    await userEvent.tab();
    expect(link).toHaveFocus();
  },
);
it.each(['pt-BR', 'en'] as const)('preserves missing and zero values in %s', (locale) => {
  mount(
    {
      askingPrice: null,
      pricePerSquareMeter: null,
      bedrooms: 0,
      areaSquareMeters: null,
      activeListingCount: 0,
      timeOnMarketDays: 0,
      belowMedianPercent: null,
    },
    locale,
  );
  const link = screen.getByRole('link');
  expect(link).not.toHaveTextContent('R$ 0');
  expect(link).toHaveTextContent(
    locale === 'en' ? 'Asking price unavailable' : 'Preço pedido não disponível',
  );
  expect(link).toHaveTextContent(locale === 'en' ? '0 bedrooms' : '0 quartos');
  expect(link).toHaveTextContent(locale === 'en' ? '0 listings' : '0 anúncios');
  // The row states its basis: the place figure counts to today, the row to the last collection.
  expect(link).toHaveTextContent(
    locale === 'en'
      ? '0 days on market at last collection'
      : '0 dias no mercado até a última coleta',
  );
  expect(link).not.toHaveTextContent(/median|mediana/);
});
it.each([-3.1, 0, 3.1])(
  'uses words and semantic colors for comparison %s',
  (belowMedianPercent) => {
    const view = mount({
      belowMedianPercent,
      returnedToMarket: true,
      bedrooms: null,
      areaSquareMeters: 0,
    });
    expect(screen.getByRole('link')).toHaveTextContent('Returned to market');
    expect(screen.getByRole('link')).not.toHaveTextContent('days on market');
    expect(view.container.querySelector('.prow__comparison')).toHaveClass(
      belowMedianPercent > 0 ? 'down' : belowMedianPercent < 0 ? 'up' : 'prow__comparison',
    );
    expect(screen.getByRole('link')).toHaveTextContent(
      belowMedianPercent > 0
        ? '3.1% below median'
        : belowMedianPercent < 0
          ? '3.1% above median'
          : 'At the median',
    );
    expect(screen.getByRole('link')).toHaveTextContent('Bedrooms unavailable');
    expect(screen.getByRole('link')).toHaveTextContent('0 m²');
  },
);
it.each([
  ['pt-BR', 'Voltou ao mercado', '90 dias no mercado até a última coleta'],
  ['en', 'Returned to market', '90 days on market at last collection'],
] as const)(
  'prints the days that ordered a returned row under longest-on-market in %s',
  (locale, returned, days) => {
    mount({ returnedToMarket: true }, locale, 'longest-on-market');
    expect(screen.getByRole('link')).toHaveTextContent(returned);
    expect(screen.getByRole('link')).toHaveTextContent(days);
  },
);
it.each([
  ['pt-BR', 'Primeira coleta em 5 de mar. de 2026, 14:07 UTC'],
  ['en', 'First collected 5 Mar 2026, 14:07 UTC'],
] as const)('prints the first collection that ordered a most-recent row in %s', (locale, text) => {
  mount({ firstCollectedAt: '2026-03-05T14:07:00.000Z' }, locale, 'most-recent');
  expect(screen.getByRole('link')).toHaveTextContent(text);
});
it('prints no first collection unless it is the applied sort', () => {
  mount({}, 'en', 'longest-on-market');
  expect(screen.getByRole('link')).not.toHaveTextContent('First collected');
});
