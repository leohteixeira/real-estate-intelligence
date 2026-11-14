// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';
import { Chart } from './PlaceSeries';
import { chartPaths } from './series-presentation';
import { createLocale } from './locale';
import { seriesFixture } from './overview-fixtures.test';
import type { Locale } from './locale';

afterEach(cleanup);
it('scales from the supplied range and starts new segments only at real gaps', () => {
  expect(chartPaths([800000, null, 900000], 800000, 900000)).toEqual(['M8,170', 'M472,10']);
  expect(chartPaths([800000, 850000, 900000], 800000, 900000)).toEqual(['M8,170 L240,90 L472,10']);
  expect(chartPaths([null, null], 0, 0)).toEqual([]);
});
it.each(['pt-BR', 'en'] as const)(
  'labels real prices, localized months, identities and gap endpoints in %s',
  (locale: Locale) => {
    const { container } = render(
      <I18nextProvider i18n={createLocale(locale)}>
        <Chart series={seriesFixture()} />
      </I18nextProvider>,
    );
    expect(screen.getByText(locale === 'en' ? 'R$ 8,000.00' : 'R$ 8.000,00')).toBeVisible();
    expect(screen.getByText(locale === 'en' ? 'R$ 9,110.00' : 'R$ 9.110,00')).toBeVisible();
    expect([...container.querySelectorAll('time')].map((time) => time.dateTime)).toEqual([
      '2025-11',
      '2026-04',
      '2026-10',
    ]);
    expect(container.querySelector('time')).toHaveAttribute('datetime', '2025-11');
    expect(container.querySelector('time')).not.toHaveTextContent('2025-11');
    expect(
      screen.getByText(locale === 'en' ? 'Place: Bela Vista' : 'Lugar: Bela Vista'),
    ).toBeVisible();
    expect(
      screen.getByText(locale === 'en' ? 'Comparison: Central zone' : 'Comparação: Centro'),
    ).toBeVisible();
    expect(container.querySelectorAll('.place-chart__subject')).toHaveLength(2);
    expect(container.querySelectorAll('.place-chart__endpoint--subject')).toHaveLength(4);
    expect(container.querySelectorAll('.place-chart__endpoint--parent')).toHaveLength(2);
  },
);
it('keeps equal subject and parent values at identical coordinates instead of manufacturing separation', () => {
  const fixture = seriesFixture();
  const series = {
    ...fixture,
    points: fixture.points.map((point) => ({ ...point, median: point.parentMedian! })),
  };
  const { container } = render(
    <I18nextProvider i18n={createLocale('en')}>
      <Chart series={series} />
    </I18nextProvider>,
  );
  expect(chartPaths([800000, 800000], 800000, 800000)).toEqual(['M8,90 L472,90']);
  expect(container.querySelector('.place-chart__subject')?.getAttribute('d')).toBe(
    container.querySelector('.place-chart__parent')?.getAttribute('d'),
  );
  expect(container.querySelectorAll('.place-chart__prices span')).toHaveLength(1);
  expect(screen.getByText('R$ 8,000.00')).toBeVisible();
});
it('shows no price tick, line or endpoint when every supplied monthly median is unavailable', () => {
  const fixture = seriesFixture();
  const unavailable = fixture.points[5]!.median;
  const series = {
    ...fixture,
    comparisonPlace: null,
    points: fixture.points.map((point) => ({ ...point, median: unavailable, parentMedian: null })),
  };
  const { container } = render(
    <I18nextProvider i18n={createLocale('en')}>
      <Chart series={series} />
    </I18nextProvider>,
  );
  expect(screen.getByText('Not available')).toBeVisible();
  expect(
    container.querySelectorAll('.place-chart__subject, .place-chart__parent, circle'),
  ).toHaveLength(0);
  expect(container.querySelectorAll('.place-chart__legend-parent')).toHaveLength(0);
  expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
});
