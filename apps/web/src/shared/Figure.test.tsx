// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';
import { createLocale } from '../places/locale';
import { Figure } from './Figure';
import { evidence } from './shared-fixtures.test';
afterEach(cleanup);
it.each(['pt-BR', 'en'] as const)(
  'renders the exact figure and required evidence in %s',
  (locale) => {
    render(
      <I18nextProvider i18n={createLocale(locale)}>
        <Figure
          label="Median"
          labelId="median"
          priceKind="asking"
          minorUnits={951515}
          unit="/m²"
          evidence={evidence}
          synthetic
        />
      </I18nextProvider>,
    );
    expect(
      screen.getByRole('heading', { name: locale === 'en' ? 'Median Asking' : 'Median Pedido' }),
    ).toHaveAttribute('id', 'median');
    expect(screen.getByText(locale === 'en' ? 'R$ 9,515' : 'R$ 9.515')).toHaveTextContent('/m²');
    expect(
      screen.getByText(locale === 'en' ? '1 contributing property' : '1 imóvel contribuinte'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: locale === 'en' ? 'Sources: Synthetic source' : 'Fontes: Synthetic source',
      }),
    ).toHaveAttribute('href', evidence.sources[0]!.url);
    expect(screen.getByText(/UTC/)).toBeVisible();
    expect(screen.getByText(locale === 'en' ? 'Synthetic data' : 'Dados sintéticos')).toBeVisible();
  },
);
it('requires a genuine optional method destination and supports sale figures', () => {
  render(
    <I18nextProvider i18n={createLocale('en')}>
      <Figure
        label="Sale median"
        priceKind="sale"
        minorUnits={0}
        evidence={evidence}
        synthetic={false}
        method={{ href: '/owned-method', label: 'Read method' }}
      />
    </I18nextProvider>,
  );
  expect(screen.getByText('Sale')).toHaveClass('tag--sale');
  expect(screen.getByText('R$ 0')).toBeVisible();
  expect(screen.queryByText('/m²')).not.toBeInTheDocument();
  expect(screen.queryByText('Synthetic data')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Read method' })).toHaveAttribute(
    'href',
    '/owned-method',
  );
});
