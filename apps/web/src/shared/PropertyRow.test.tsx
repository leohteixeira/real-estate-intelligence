// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';
import { createLocale } from '../places/locale';
import type { Locale } from '../places/locale';
import { PropertyRow } from './PropertyRow';
import { property } from './shared-fixtures.test';
afterEach(cleanup);
function mount(overrides: Partial<typeof property> = {}, locale: Locale = 'en') {
  return render(
    <I18nextProvider i18n={createLocale(locale)}>
      <PropertyRow property={{ ...property, ...overrides }} href="#owned-property" />
    </I18nextProvider>,
  );
}
it.each(['pt-BR', 'en'] as const)(
  'shows contract values and a single native destination in %s',
  async (locale) => {
    mount({}, locale);
    const link = screen.getByRole('link');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(link).toHaveAttribute('href', '#owned-property');
    expect(link).toHaveTextContent('Rua Bela — 1200–1298');
    expect(link).not.toHaveTextContent('Wrong translation');
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
  expect(link).toHaveTextContent(locale === 'en' ? '0 days on market' : '0 dias no mercado');
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
