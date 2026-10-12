import type { MarketMedian } from '@rei/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { formatComputedAt, formatMedian } from './formatters';
import type { Locale } from './locale';
import { isPlaceId, PlaceReadError } from './place-client';
import { marketQuery, placeQuery } from './place-queries';
import { PlacePlate } from './PlacePlate';

function MedianEvidence({ median }: { readonly median: MarketMedian }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="prov place-provenance">
      <span>{t('contributors', { count: median.recordCount })}</span>
      <span>
        {t('sources', { names: median.sources.map((source) => source.label).join(', ') })}
      </span>
      <span>
        {t('computed', { time: formatComputedAt(median.computedAt, i18n.language as Locale) })}
      </span>
      {median.freshness.status !== 'fresh' ? (
        <span>{t(median.freshness.status === 'stale' ? 'stale' : 'untracked')}</span>
      ) : null}
      <span className="tag tag--synthetic">{t('synthetic')}</span>
    </div>
  );
}

function ValidPlaceOverview({ id }: { readonly id: string }) {
  const { t, i18n } = useTranslation();
  const place = useQuery(placeQuery(id));
  const market = useQuery({ ...marketQuery(id), enabled: !!place.data });
  if (place.isPending)
    return (
      <div className="place-state" role="status">
        {t('loadingPlace')}
        <span className="sk" />
      </div>
    );
  if (place.isError)
    return (
      <main id="place-overview">
        {place.data ? <PlacePlate place={place.data.place} /> : null}
        <div className="place-state" role="alert">
          <h1>
            {t(
              place.error instanceof PlaceReadError && place.error.status === 404
                ? 'missingPlace'
                : 'failedPlace',
            )}
          </h1>
          <p>{t('choosePlace')}</p>
          <button
            className="btn"
            onClick={() => {
              void place.refetch();
            }}
          >
            {t('retry')}
          </button>
        </div>
      </main>
    );
  const median = market.data?.figures.medianAskingPricePerSquareMeter;
  return (
    <main id="place-overview">
      <PlacePlate place={place.data.place} />
      <div className="place-body">
        <section
          className="band place-median"
          aria-labelledby="median-label"
          aria-busy={market.isPending}
        >
          <div className="fig">
            <h2 id="median-label" className="fig__label">
              {t('median')} <span className="tag">{t('asking')}</span>
            </h2>
            {market.isPending ? (
              <div role="status">
                {t('loadingMedian')}
                <span className="sk place-median__skeleton" />
              </div>
            ) : market.isError ? (
              <div role="alert">
                <p>{t('failedMedian')}</p>
                <button
                  className="btn"
                  onClick={() => {
                    void market.refetch();
                  }}
                >
                  {t('retry')}
                </button>
              </div>
            ) : median?.state === 'available' ? (
              <>
                <p className="fig__value">
                  {formatMedian(median.value.minorUnits, i18n.language as Locale)}{' '}
                  <small>/m²</small>
                </p>
                <MedianEvidence median={median} />
              </>
            ) : (
              <div role="status">
                <h3 className="place-unavailable">{t('unavailable')}</h3>
                <p>{t('unavailableReason')}</p>
              </div>
            )}
          </div>
        </section>
        <p className="place-context">{t('preparedPlace')}</p>
      </div>
    </main>
  );
}

export function PlaceOverview() {
  const { placeId } = useParams();
  const { t } = useTranslation();
  return isPlaceId(placeId) ? (
    <ValidPlaceOverview key={placeId} id={placeId} />
  ) : (
    <main className="place-state" role="alert">
      <h1>{t('invalidPlace')}</h1>
      <p>{t('choosePlace')}</p>
    </main>
  );
}
