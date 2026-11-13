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
import { parseAskRun, parseRoutedAskLiveRun } from '@rei/contracts';
import { completed as routed } from '../headless/ask-fixtures.test';
import { askEnglish, askPortuguese } from './ask-resources';
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
    expect(document.body).not.toHaveTextContent(/Jev|Claude|Haiku/i);
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

const explanationBase = {
  version: 1,
  eventId: routed.id,
  runId: routed.id,
  threadId: routed.threadId,
  explanationId: '019ddddd-1234-7123-8123-123456789abc',
  toolReceiptId: '019eeeee-1234-7123-8123-123456789abc',
  reservationId: '019fffff-1234-7123-8123-123456789abc',
  authorship: 'model-written',
  promptVersion: 'price-explanation-prompt-v1',
  grammarVersion: 'price-explanation-facts-v1',
  locale: 'en',
  text: 'The asking price divided by area is the returned deterministic value.',
  outputTokens: 30,
  acceptedAt: routed.updatedAt,
};
it.each(['pt-BR', 'en'] as const)(
  'renders a historical gateway record with its original model, route, source and privacy evidence in %s',
  (locale) => {
    const labels = locale === 'en' ? askEnglish : askPortuguese;
    const run = parseRoutedAskLiveRun({
      ...routed,
      basis: 'routed-text-explanation-v1',
      locale: 'en',
      decision: {
        ...routed.decision,
        source: 'gateway-jev-v1',
        degraded: false,
        privacyEvidenceId: 'historical-decision-evidence',
      },
      explanation: {
        ...explanationBase,
        model: 'anthropic/claude-haiku-5.5',
        route: 'vercel-ai-gateway',
        privacyEvidenceId: 'historical-privacy-evidence',
      },
    });
    render(
      <I18nextProvider i18n={createLocale(locale)}>
        <MemoryRouter>
          <AskRunRecord run={run} placeId="sao-paulo-bela-vista" />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByText('anthropic/claude-haiku-5.5')).toBeInTheDocument();
    expect(screen.getByText('vercel-ai-gateway')).toBeInTheDocument();
    expect(screen.getByText(labels.privacyEvidence).nextElementSibling).toHaveTextContent(
      'historical-privacy-evidence',
    );
    expect(screen.getByText(labels.decisionSource).nextElementSibling).toHaveTextContent(
      'gateway-jev-v1',
    );
  },
);
it.each(['pt-BR', 'en'] as const)(
  'renders a direct record without a privacy evidence row in %s',
  (locale) => {
    const labels = locale === 'en' ? askEnglish : askPortuguese;
    const run = parseRoutedAskLiveRun({
      ...routed,
      basis: 'routed-text-explanation-v1',
      locale: 'en',
      decision: { ...routed.decision, source: 'claude-haiku-v1', degraded: false },
      explanation: {
        ...explanationBase,
        model: 'claude-haiku-5-5',
        route: 'anthropic-direct',
        privacyEvidenceId: null,
      },
    });
    render(
      <I18nextProvider i18n={createLocale(locale)}>
        <MemoryRouter>
          <AskRunRecord run={run} placeId="sao-paulo-bela-vista" />
        </MemoryRouter>
      </I18nextProvider>,
    );
    expect(screen.getByText(labels.model).nextElementSibling).toHaveTextContent('claude-haiku-5-5');
    expect(screen.getByText(labels.route).nextElementSibling).toHaveTextContent('anthropic-direct');
    expect(screen.queryByText(labels.privacyEvidence)).not.toBeInTheDocument();
    expect(screen.getByText(labels.decisionSource).nextElementSibling).toHaveTextContent(
      'claude-haiku-v1',
    );
    expect(document.body).not.toHaveTextContent('null');
  },
);
