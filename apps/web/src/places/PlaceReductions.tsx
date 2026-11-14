import type { PlaceRef, Reduction } from '@rei/contracts';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PropertyRow } from '../shared/PropertyRow';
import { formatComputedAt, formatExactMoney, formatPercentage } from './formatters';
import type { Locale } from './locale';
import { propertyQuery, reductionsQuery } from './place-queries';
import { destinationPath } from '../shell/public-routes';
import { propertyHref } from '../properties/property-navigation';
import { OverviewReadState } from './OverviewReadState';
import { placeName } from './locale';

function HistoricalReduction({ reduction }: { readonly reduction: Reduction }) {
  const { t, i18n } = useTranslation('place');
  const locale = i18n.language as Locale;
  return (
    <div className="place-reduction-evidence">
      <p>
        <span className="tag">{t('asking')}</span>{' '}
        {t('historicalChange', {
          percentage: formatPercentage(-reduction.reductionPercent / 100, locale),
          previous: formatExactMoney(reduction.previousMinorUnits, locale),
          current: formatExactMoney(reduction.currentMinorUnits, locale),
        })}
      </p>
      <p>
        {t('historyTime', {
          time: formatComputedAt(reduction.effectiveAt, locale),
          observed: formatComputedAt(reduction.provenance.observedAt, locale),
        })}
      </p>
      <a href={reduction.provenance.sourceUrl}>
        {t('historySource', { source: reduction.provenance.sourceId })}
      </a>
      <span className="tag tag--synthetic">{t('synthetic')}</span>
    </div>
  );
}
export function PlaceReductions({ place }: { readonly place: PlaceRef }) {
  const { t, i18n } = useTranslation('place');
  const history = useQuery(reductionsQuery(place.id));
  // The client rejects more than three rows, so at most three abortable details are in flight.
  const details = useQueries({
    queries: (history.data?.items ?? []).map((item) => propertyQuery(place.id, item.propertyId)),
  });
  const href = destinationPath('search', place.id);
  return (
    <section className="panel place-reductions" aria-labelledby="reductions-label">
      <div className="sec">
        <h2 id="reductions-label">{t('largestReductions')}</h2>
      </div>
      <Link className="place-all-properties" to={href}>
        {t('allProperties', { name: placeName(place.name, i18n.language) })}
      </Link>
      <p className="place-panel-copy">{t('historyOrigin')}</p>
      <OverviewReadState
        pending={history.isPending}
        error={history.error}
        retry={() => {
          void history.refetch();
        }}
        label={t('largestReductions')}
      />
      {history.data?.items.length === 0 ? (
        <p className="place-panel-copy">{t('emptyReductions')}</p>
      ) : null}
      <ul>
        {history.data?.items.map((item, index) => {
          const detail = details[index]!;
          return (
            <li key={`${item.listingId}:${item.effectiveAt}`}>
              <HistoricalReduction reduction={item} />
              {detail.data ? (
                // The row describes one property, so it opens that property rather than the list.
                <PropertyRow
                  property={detail.data.property.summary}
                  href={propertyHref(item.propertyId, '')}
                />
              ) : null}
              <OverviewReadState
                pending={detail.isPending}
                error={detail.error}
                retry={() => {
                  void detail.refetch();
                }}
                label={t('propertyDetail')}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
