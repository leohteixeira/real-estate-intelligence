import type { PropertyResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatComputedAt, formatExactMoney, formatPercentage } from '../places/formatters';
import type { Locale } from '../places/locale';
import { sourceLabel } from './property-presentation';
import { PropertySourceLink } from './PropertySourceLink';
import { sourceName } from '../shared/api-labels';

export function PropertyHistory({ response }: { readonly response: PropertyResponse }) {
  const { t, i18n } = useTranslation('property');
  const locale = i18n.language as Locale;
  const changes = [...response.property.priceChanges].sort((a, b) =>
    a.effectiveAt.localeCompare(b.effectiveAt),
  );
  const values = changes.flatMap((change) => [change.previousMinorUnits, change.currentMinorUnits]);
  const low = Math.min(...values),
    high = Math.max(...values);
  const start = Date.parse(changes[0]?.effectiveAt ?? response.metadata.asOf),
    end = Math.max(start + 1, Date.parse(response.metadata.asOf));
  const x = (date: string) => 8 + ((Date.parse(date) - start) / (end - start)) * 304;
  const y = (value: number) => 102 - ((value - low) / Math.max(1, high - low)) * 94;
  // Each listing has its own price line: joining two sources' prices would draw a change that
  // no listing made.
  const series = new Map<string, typeof changes>();
  for (const change of changes) {
    const key = `${change.provenance.sourceId}\u0000${change.provenance.sourceListingId}`;
    series.set(key, [...(series.get(key) ?? []), change]);
  }
  const paths = [...series].map(([key, own]) => ({
    key,
    d:
      own
        .map(
          (change, index) =>
            `${index === 0 ? `M${x(change.effectiveAt)},${y(change.previousMinorUnits)}` : `H${x(change.effectiveAt)}`}V${y(change.currentMinorUnits)}`,
        )
        .join(' ') + ' H312',
  }));
  const minimum = response.property.minimumReduction;
  return (
    <section className="panel property-history" aria-labelledby="property-history-title">
      <div className="sec">
        <h2 id="property-history-title">{t('history')}</h2>
        <span className="small muted">{t('changes', { count: changes.length })}</span>
      </div>
      <div className="property-panel-body">
        {minimum ? (
          // The backend figure the place reductions panel reports, formatted the same way.
          <>
            <p className="property-minimum-reduction">
              <strong>
                {t('minimumReduction', {
                  previous: formatExactMoney(minimum.previousMinorUnits, locale),
                  current: formatExactMoney(minimum.currentMinorUnits, locale),
                  percentage: formatPercentage(-minimum.reductionPercent / 100, locale),
                })}
              </strong>
            </p>
            <p className="small">{t('minimumReductionBasis')}</p>
          </>
        ) : null}
        <p className="small">{t('historyBasis')}</p>
        {changes.length ? (
          <div className="property-chart">
            <div className="property-chart-values small">
              <span>{formatExactMoney(high, locale)}</span>
              <span>{formatExactMoney(low, locale)}</span>
            </div>
            <svg
              className="property-price-chart"
              viewBox="0 0 320 110"
              role="img"
              aria-label={changes
                .map(
                  (change) =>
                    `${formatComputedAt(change.effectiveAt, locale)}: ${formatExactMoney(change.previousMinorUnits, locale)} → ${formatExactMoney(change.currentMinorUnits, locale)}; ${sourceLabel(response, change.provenance.sourceId, i18n)}`,
                )
                .join('. ')}
            >
              <path d="M8 8H312M8 55H312M8 102H312" className="property-chart-grid" />
              {paths.map((line) => (
                <path key={line.key} d={line.d} className="property-chart-line" />
              ))}
              {changes.map((change) => (
                <circle
                  key={`${change.effectiveAt}:${change.provenance.snapshotId}`}
                  cx={x(change.effectiveAt)}
                  cy={y(change.currentMinorUnits)}
                  r="4"
                  className="property-chart-point"
                />
              ))}
            </svg>
            <div className="property-chart-dates small">
              <time dateTime={changes[0]!.effectiveAt}>
                {formatComputedAt(changes[0]!.effectiveAt, locale)}
              </time>
              <time dateTime={response.metadata.asOf}>
                {formatComputedAt(response.metadata.asOf, locale)}
              </time>
            </div>
          </div>
        ) : (
          <p>{t('noChanges')}</p>
        )}
        <ol className="rows property-price-events">
          {[...changes].reverse().map((change) => {
            const listing = response.property.listings.find(
              (item) =>
                item.source.sourceId === change.provenance.sourceId &&
                item.source.sourceListingId === change.provenance.sourceListingId,
            );
            return (
              <li key={`${change.effectiveAt}:${change.provenance.snapshotId}`}>
                <div className="spread">
                  <strong>
                    {t('changed')} · {formatExactMoney(change.currentMinorUnits, locale)}
                  </strong>
                  <span
                    className={
                      change.changePercent < 0 ? 'down' : change.changePercent > 0 ? 'up' : ''
                    }
                  >
                    {formatPercentage(change.changePercent / 100, locale)}
                  </span>
                </div>
                <p className="small">
                  {t('previous')}: {formatExactMoney(change.previousMinorUnits, locale)} ·{' '}
                  <time dateTime={change.effectiveAt}>
                    {formatComputedAt(change.effectiveAt, locale)}
                  </time>
                </p>
                <p className="prov">
                  {listing ? (
                    <PropertySourceLink listingId={listing.id}>
                      {sourceName(listing.source, i18n)}
                    </PropertySourceLink>
                  ) : (
                    sourceLabel(response, change.provenance.sourceId, i18n)
                  )}{' '}
                  ·{' '}
                  {t('observed', { date: formatComputedAt(change.provenance.observedAt, locale) })}
                </p>
              </li>
            );
          })}
        </ol>
        <p className="small">
          <strong>{t('firstSeen')}</strong> ·{' '}
          {formatComputedAt(response.property.summary.firstCollectedAt, locale)}
        </p>
        <p className="prov">{t('initialUnavailable')}</p>
      </div>
    </section>
  );
}
