// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it } from 'vitest';
import { createLocale } from '../places/locale';
import { formatComputedAt, formatExactMoney } from '../places/formatters';
import { AskRunRecord } from './AskRunRecord';
import { completed, prior, running } from './ask-fixtures.test';
import { parseAskRun } from '@rei/contracts';
afterEach(cleanup);
it.each([
  ['pt-BR', 80.125, '80,125'],
  ['en', 80.125, '80.125'],
  ['pt-BR', 0.0001, '0,0001'],
  ['en', 0.0001, '0.0001'],
  ['pt-BR', Number.MIN_VALUE, '0,' + '0'.repeat(323) + '5'],
  ['en', Number.MIN_VALUE, '0.' + '0'.repeat(323) + '5'],
] as const)('preserves exact received area in %s for %s', (locale, area, expected) => {
  if (completed.result?.kind !== 'price_per_square_meter')
    throw new Error('Price fixture required');
  const inputs = { ...completed.result.inputs, areaSquareMeters: area };
  const run = parseAskRun({
    ...completed,
    originalInputs: inputs,
    result: { ...completed.result, inputs },
  });
  render(
    <I18nextProvider i18n={createLocale(locale)}>
      <MemoryRouter>
        <AskRunRecord run={run} placeId="sao-paulo-bela-vista" />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(
    screen.getByText(`${formatExactMoney(inputs.priceMinorUnits, locale)} ÷ ${expected} m²`),
  ).toBeVisible();
  expect(
    screen.getByText(formatExactMoney(completed.result.minorUnits, locale), { exact: false }),
  ).toBeVisible();
});
it.each(['pt-BR', 'en'] as const)(
  'shows exact returned result/inputs/time and explicit evidence absence in %s',
  (locale) => {
    render(
      <I18nextProvider i18n={createLocale(locale)}>
        <MemoryRouter>
          <AskRunRecord run={completed} placeId="sao-paulo-bela-vista" />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByRole('heading', { name: completed.question })).toBeVisible();
    expect(screen.getByText(formatExactMoney(1000000, locale), { exact: false })).toBeVisible();
    expect(screen.getByText(`${formatExactMoney(80000000, locale)} ÷ 80 m²`)).toBeVisible();
    expect(
      screen.getAllByText(formatComputedAt(completed.updatedAt, locale)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(
        locale === 'en' ? 'Model explanation unavailable' : 'Explicação de modelo não disponível',
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        locale === 'en'
          ? 'No market citations were returned.'
          : 'Nenhuma citação de mercado foi retornada.',
      ),
    ).toBeVisible();
    expect(document.querySelectorAll('.steps li')).toHaveLength(completed.steps.length);
    expect(document.body).not.toHaveTextContent('Jev');
    expect(document.body).toHaveTextContent(
      locale === 'en'
        ? 'This example is not associated with a place.'
        : 'Este exemplo não está associado a um lugar.',
    );
  },
);
it('preserves the returned synthetic binding independently of navigation geography', () => {
  render(
    <I18nextProvider i18n={createLocale('en')}>
      <MemoryRouter>
        <AskRunRecord
          run={{ ...completed, placeId: 'sao-paulo-pinheiros' }}
          placeId="sao-paulo-bela-vista"
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(document.body).toHaveTextContent(
    'Place recorded in the example: sao-paulo-pinheiros. This is not a market analysis of that place.',
  );
  expect(document.body).not.toHaveTextContent('This example is not associated with a place.');
});
it('uses the incumbent running status class for a received running record', () => {
  render(
    <I18nextProvider i18n={createLocale('en')}>
      <MemoryRouter>
        <AskRunRecord run={running} placeId="sao-paulo-bela-vista" />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(screen.getByText('Running', { exact: true })).toHaveClass('st', 'st--running');
});
it('shows no result while progressing and no price for unavailable history', () => {
  const locale = createLocale('en');
  const view = render(
    <I18nextProvider i18n={locale}>
      <MemoryRouter>
        <AskRunRecord run={running} placeId="sao-paulo-bela-vista" />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(document.body).not.toHaveTextContent('R$');
  view.rerender(
    <I18nextProvider i18n={locale}>
      <MemoryRouter>
        <AskRunRecord run={prior} placeId="sao-paulo-bela-vista" />
      </MemoryRouter>
    </I18nextProvider>,
  );
  expect(screen.getByText('This intent is not available in the prepared example.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Search properties' })).toHaveAttribute(
    'href',
    '/search/sao-paulo-bela-vista',
  );
  expect(document.body).not.toHaveTextContent('R$');
});
