import type { MarketMedian, PlaceMarketSeriesResponse } from '@rei/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Provenance } from '../shared/Provenance';
import { formatComputedAt, formatExactMoney, formatMedian } from './formatters';
import type { Locale } from './locale';
import { seriesQuery } from './place-queries';
import { OverviewReadState } from './OverviewReadState';
import { chartEndpoints, chartMonthTicks, chartPaths, chartX, chartY } from './series-presentation';
export function Chart({ series }: { readonly series: PlaceMarketSeriesResponse }) {
  const { t, i18n } = useTranslation('place');
  const locale = i18n.language as Locale;
  const subject = series.points.map((point) => point.median.value?.minorUnits ?? null);
  const parent = series.points.map((point) => point.parentMedian?.value?.minorUnits ?? null);
  const available = [...subject, ...parent].filter((value) => value !== null);
  const minimum = available.length ? Math.min(...available) : 0;
  const maximum = available.length ? Math.max(...available) : 0;
  const ticks = available.length
    ? minimum === maximum
      ? [minimum]
      : [maximum, (minimum + maximum) / 2, minimum]
    : [];
  return (
    <figure className="place-chart">
      <div className="place-chart__frame">
        <div
          className={`place-chart__prices ${ticks.length === 1 ? 'place-chart__prices--equal' : ''}`}
        >
          {ticks.length ? (
            ticks.map((value) => <span key={value}>{formatExactMoney(value, locale)}</span>)
          ) : (
            <span>{t('figureUnavailable')}</span>
          )}
        </div>
        <svg
          viewBox="0 0 480 180"
          role="img"
          aria-label={t(
            series.basis === 'event-fed-place-figures'
              ? 'liveSeriesDescription'
              : 'seriesDescription',
            { name: series.place.name.ptBR },
          )}
        >
          {ticks.map((value) => (
            <path
              key={value}
              d={`M8 ${chartY(value, minimum, maximum)}H472`}
              className="place-chart__grid"
            />
          ))}
          {chartPaths(parent, minimum, maximum).map((d, index) => (
            <path key={index} d={d} className="place-chart__parent" />
          ))}
          {chartPaths(subject, minimum, maximum).map((d, index) => (
            <path key={index} d={d} className="place-chart__subject" />
          ))}
          {(
            [
              ['parent', parent],
              ['subject', subject],
            ] as const
          ).flatMap(([kind, values]) =>
            chartEndpoints(values).map(({ index, value }) => (
              <circle
                key={`${kind}-${index}`}
                className={`place-chart__endpoint place-chart__endpoint--${kind}`}
                cx={chartX(index, values.length)}
                cy={chartY(value, minimum, maximum)}
                r={kind === 'parent' ? 5 : 3}
              />
            )),
          )}
        </svg>
        <div className="place-chart__months">
          {chartMonthTicks(
            series.points.map((point) => point.month),
            locale,
          ).map(({ index, month, label }) => (
            <time key={month} dateTime={month} style={{ gridColumn: index + 1 }}>
              {label}
            </time>
          ))}
        </div>
      </div>
      <figcaption>
        <span className="tag">{t('asking')} /m²</span>
        <span className="place-chart__legend-subject">
          {t('seriesSubject', { name: series.place.name.ptBR })}
        </span>
        {series.comparisonPlace ? (
          <span className="place-chart__legend-parent">
            {t('seriesComparison', { name: series.comparisonPlace.name.ptBR })}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
function MonthlyValue({ median, asOf }: { readonly median: MarketMedian; readonly asOf?: string }) {
  const { t, i18n } = useTranslation('place');
  return (
    <>
      <span className="tag">{t('asking')}</span>{' '}
      <span className="num">
        {median.state === 'available'
          ? `${formatMedian(median.value.minorUnits, i18n.language as Locale)} /m²`
          : t('figureUnavailable')}
      </span>
      <details className="place-point-evidence">
        <summary>{t('pointEvidence')}</summary>
        <p className="place-origin">{t(asOf ? 'live' : 'prepared')}</p>
        {asOf ? (
          <p className="place-month-cutoff">
            <time dateTime={asOf}>
              {t('monthlyCutoff', { time: formatComputedAt(asOf, i18n.language as Locale) })}
            </time>
          </p>
        ) : null}
        <Provenance evidence={median} synthetic />
      </details>
    </>
  );
}
export function PlaceSeries({ id }: { readonly id: string }) {
  const { t } = useTranslation('place');
  const query = useQuery(seriesQuery(id));
  const series = query.data;
  return (
    <section className="panel place-series" aria-labelledby="series-label">
      <div className="sec">
        <h2 id="series-label">{t('series')}</h2>
      </div>
      <OverviewReadState
        pending={query.isPending}
        error={query.error}
        retry={() => {
          void query.refetch();
        }}
        label={t('series')}
      />
      {series ? (
        <>
          <p className="place-origin">
            {t(series.basis === 'event-fed-place-figures' ? 'live' : 'prepared')}
          </p>
          <Chart series={series} />
          <details className="place-series-disclosure">
            <summary>{t('seriesDisclosure')}</summary>
            <div className="place-series-table">
              <table>
                <caption>{t('seriesTable')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('month')}</th>
                    <th scope="col">{series.place.name.ptBR}</th>
                    {series.comparisonPlace ? (
                      <th scope="col">{series.comparisonPlace.name.ptBR}</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {series.points.map((point) => (
                    <tr key={point.month}>
                      <th scope="row">{point.month}</th>
                      <td>
                        <MonthlyValue
                          median={point.median}
                          asOf={'asOf' in point ? point.asOf : undefined}
                        />
                      </td>
                      {point.parentMedian ? (
                        <td>
                          <MonthlyValue
                            median={point.parentMedian}
                            asOf={'asOf' in point ? point.asOf : undefined}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
