// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocale } from '../places/locale';
import type { Locale } from '../places/locale';
import { Figure } from './Figure';
import { evidence } from './shared-fixtures.test';
import { LoadingState, NoResultsState, LoadErrorState, StaleFiguresNotice } from './SystemStates';

afterEach(cleanup);
function mount(children: ReactNode, locale: Locale = 'pt-BR') {
  return render(<I18nextProvider i18n={createLocale(locale)}>{children}</I18nextProvider>);
}
it.each(['pt-BR', 'en'] as const)(
  'announces loading once with a decorative faithful skeleton in %s',
  (locale) => {
    const { container } = mount(
      <LoadingState label={locale === 'en' ? 'Loading place…' : 'Carregando lugar…'} />,
      locale,
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      locale === 'en' ? 'Loading place…' : 'Carregando lugar…',
    );
    expect(container.querySelector('.system-loading__skeleton')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.queryByText('Pinheiros')).not.toBeInTheDocument();
  },
);
it.each(['pt-BR', 'en'] as const)(
  'names the backend empty explanation and invokes genuine recovery in %s',
  async (locale) => {
    const relax = vi.fn();
    mount(
      <NoResultsState
        placeName="Pinheiros"
        filterCount={6}
        responsibleFilter="R$/m²"
        limitMinorUnits={900000}
        lastExcludedCount={41}
        minimumMinorUnits={987000}
        relax={{ label: 'Relax owned limit', onClick: relax }}
        widen={{ label: 'Widen owned place', href: '#owned-zone' }}
      />,
      locale,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Pinheiros');
    expect(screen.getByRole('status')).toHaveTextContent('41');
    expect(screen.getByRole('status')).toHaveTextContent(locale === 'en' ? 'R$ 9,870' : 'R$ 9.870');
    await userEvent.click(screen.getByRole('button', { name: 'Relax owned limit' }));
    expect(relax).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Widen owned place' })).toHaveAttribute(
      'href',
      '#owned-zone',
    );
    expect(screen.queryByText(/alerta|alert/)).not.toBeInTheDocument();
  },
);
it('shows an alert action only when the caller supplies its real destination', () => {
  mount(
    <NoResultsState
      placeName="Pinheiros"
      filterCount={1}
      responsibleFilter="Price"
      limitMinorUnits={0}
      lastExcludedCount={0}
      minimumMinorUnits={0}
      relax={{ label: 'Relax', href: '#relax' }}
      widen={{ label: 'Widen', href: '#widen' }}
      alert={{ label: 'Create owned alert', href: '#alert' }}
    />,
    'en',
  );
  expect(screen.getByRole('status')).toHaveTextContent('R$ 0');
  expect(screen.getByRole('link', { name: 'Create owned alert' })).toHaveAttribute(
    'href',
    '#alert',
  );
});
it.each([undefined, 'private-payload', 'd392f952-20fa-49b4-8cf6-4da26c8d7abc-extra'])(
  'does not expose absent/invalid public support evidence %s',
  async (requestId) => {
    const retry = vi.fn();
    mount(
      <LoadErrorState
        description="Median read failed"
        retry={retry}
        {...(requestId ? { requestId } : {})}
      />,
      'en',
    );
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(/Support reference/)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('private-payload');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  },
);
it.each(['pt-BR', 'en'] as const)(
  'uses the authored full-width retry and valid public UUID in %s',
  (locale) => {
    const requestId = 'd392f952-20fa-49b4-8cf6-4da26c8d7abc';
    mount(
      <LoadErrorState
        description="Median read failed"
        context="Pinheiros · owned filters"
        retry={() => undefined}
        requestId={requestId}
      />,
      locale,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Pinheiros · owned filters');
    expect(screen.getByText(/Support reference|Referência para o suporte/)).toHaveTextContent(
      requestId,
    );
    expect(
      screen.getByRole('button', { name: locale === 'en' ? 'Try again' : 'Tentar de novo' }),
    ).toHaveClass('btn--block');
  },
);
it.each(['pt-BR', 'en'] as const)(
  'keeps stale value and every provenance field unchanged without inferred failure in %s',
  (locale) => {
    const stale = {
      ...evidence,
      freshness: { ...evidence.freshness, status: 'stale' as const, ageSeconds: 172800 },
    };
    mount(
      <>
        <StaleFiguresNotice freshness={stale.freshness} />
        <Figure label="Median" priceKind="asking" minorUnits={951515} evidence={stale} synthetic />
      </>,
      locale,
    );
    expect(screen.getByRole('status')).toHaveTextContent(locale === 'en' ? '2 days' : '2 dias');
    expect(screen.getByText(locale === 'en' ? 'R$ 9,515' : 'R$ 9.515')).toBeVisible();
    expect(screen.getByText(/UTC/)).toBeVisible();
    expect(screen.getByRole('link')).toHaveTextContent('Synthetic source');
    expect(screen.getByRole('status')).not.toHaveTextContent('Synthetic source');
    expect(
      screen.queryByText(/Collection status|Situação da coleta|since|desde/),
    ).not.toBeInTheDocument();
  },
);
it.each([0, 90, 7200, null])('presents zero, short or missing age honestly: %s', (ageSeconds) => {
  mount(
    <StaleFiguresNotice freshness={{ ...evidence.freshness, status: 'stale', ageSeconds }} />,
    'en',
  );
  expect(screen.getByRole('status')).toHaveTextContent(
    ageSeconds === null
      ? 'Age unavailable'
      : ageSeconds === 0
        ? '0 seconds'
        : ageSeconds === 90
          ? '1 minute'
          : '2 hours',
  );
});
it.each(['fresh', 'untracked'] as const)(
  'does not convert %s evidence into a stale notice',
  (status) => {
    mount(<StaleFiguresNotice freshness={{ ...evidence.freshness, status }} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  },
);
it('renders explicit source/since but gates collection access on caller authorization', () => {
  const freshness = { ...evidence.freshness, status: 'stale' as const };
  const view = mount(
    <StaleFiguresNotice
      freshness={freshness}
      failure={{ sourceName: 'Owned source', since: evidence.computedAt }}
    />,
    'en',
  );
  expect(screen.getByRole('status')).toHaveTextContent('Owned source');
  expect(screen.getByRole('status')).toHaveTextContent('UTC');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  view.unmount();
  mount(
    <StaleFiguresNotice
      freshness={freshness}
      collectionStatus={{ authorized: true, href: '#owned-collection', label: 'Collection status' }}
    />,
    'en',
  );
  expect(screen.getByRole('link', { name: 'Collection status' })).toHaveAttribute(
    'href',
    '#owned-collection',
  );
});
