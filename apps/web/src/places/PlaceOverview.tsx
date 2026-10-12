import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { LoadErrorState, LoadingState, StaleFiguresNotice } from '../shared/SystemStates';
import { isPlaceId, PlaceReadError } from './place-client';
import { marketQuery, neighboursQuery, placeQuery, placesQuery } from './place-queries';
import { PlacePlate } from './PlacePlate';
import { PlaceQuestion } from './PlaceQuestion';
import { OverviewMedian, OverviewMetric } from './OverviewFigure';
import { PlaceSeries } from './PlaceSeries';
import { PlaceNeighbours, PlaceSchematic } from './PlaceNeighbours';
import { PlaceReductions } from './PlaceReductions';
import { formatComputedAt, formatCount, formatPercentage, formatQuantity } from './formatters';
import type { Locale } from './locale';
import { destinationPath } from '../shell/public-routes';

function ValidPlaceOverview({ id }: { readonly id: string }) {
  const { t, i18n } = useTranslation('place');
  const locale = i18n.language as Locale;
  const catalogue = useQuery({ ...placesQuery(), enabled: false });
  const place = useQuery(placeQuery(id));
  const market = useQuery({ ...marketQuery(id), enabled: !!place.data });
  const neighbours = useQuery({ ...neighboursQuery(id), enabled: !!place.data });
  const knownPlace = place.data?.place ?? catalogue.data?.items.find((item) => item.id === id);
  if (place.isPending)
    return (
      <main id="place-overview">
        {knownPlace ? <PlacePlate place={knownPlace} /> : null}
        <LoadingState label={t('loadingPlace')} />
      </main>
    );
  if (place.isError && !place.data)
    return (
      <main id="place-overview">
        {knownPlace && !(place.error instanceof PlaceReadError && place.error.status === 404) ? (
          <PlacePlate place={knownPlace} />
        ) : null}
        <div className="place-state">
          {place.error instanceof PlaceReadError && place.error.status === 404 ? (
            <h1>{t('missingPlace')}</h1>
          ) : null}
          <LoadErrorState
            description={t('failedPlace')}
            context={t('choosePlace')}
            retry={() => {
              void place.refetch();
            }}
            {...(place.error instanceof PlaceReadError && place.error.requestId
              ? { requestId: place.error.requestId }
              : {})}
          />
        </div>
      </main>
    );
  const median = market.data?.figures.medianAskingPricePerSquareMeter;
  const figures = market.data?.figures;
  const preparedAt =
    market.data?.basis === 'event-fed-median-with-prepared-sections'
      ? market.data.preparedEvaluatedAt
      : undefined;
  const parent = market.data?.parentMedian;
  return (
    <main id="place-overview">
      {place.data ? (
        <PlacePlate place={place.data.place}>
          <PlaceQuestion place={place.data.place} />
        </PlacePlate>
      ) : null}
      {place.isError ? (
        <LoadErrorState
          description={t('failedPlace')}
          context={t('choosePlace')}
          retry={() => {
            void place.refetch();
          }}
          {...(place.error instanceof PlaceReadError && place.error.requestId
            ? { requestId: place.error.requestId }
            : {})}
        />
      ) : null}
      <div className="place-body">
        {market.data && preparedAt ? (
          <div className="place-counts">
            <p>
              {t('counts', {
                properties: formatCount(market.data.counts.properties, locale),
                listings: formatCount(market.data.counts.activeListings, locale),
                sources: formatCount(market.data.counts.sources, locale),
              })}
            </p>
            <p className="small">
              {t('countsOrigin', { time: formatComputedAt(preparedAt, locale) })}
            </p>
          </div>
        ) : null}
        <div className="place-key-figures">
          <section
            className="band place-median"
            aria-labelledby="median-label"
            aria-busy={market.isPending}
          >
            {median ? (
              <>
                <StaleFiguresNotice freshness={median.freshness} />
                <OverviewMedian median={median} label={t('median')} labelId="median-label" />
              </>
            ) : (
              <div className="fig">
                <h2 id="median-label" className="fig__label">
                  {t('median')} <span className="tag">{t('asking')}</span>
                </h2>
                {market.isPending ? (
                  <LoadingState label={t('loadingMedian')} layout="figure" />
                ) : market.isError ? null : (
                  <div role="status">
                    <h3 className="place-unavailable">{t('unavailable')}</h3>
                    <p>{t('unavailableReason')}</p>
                  </div>
                )}
              </div>
            )}
            {market.isError ? (
              <LoadErrorState
                description={t('failedMedian')}
                retry={() => {
                  void market.refetch();
                }}
                {...(market.error instanceof PlaceReadError && market.error.requestId
                  ? { requestId: market.error.requestId }
                  : {})}
              />
            ) : null}
          </section>
          {parent && parent.place.id === place.data?.place.parentId ? (
            <section className="band place-parent" aria-labelledby="parent-label">
              <OverviewMedian
                median={parent.median}
                label={
                  <Link to={destinationPath('places', parent.place.id)}>
                    {t('parentMedian', { name: parent.place.name.ptBR })}
                  </Link>
                }
                labelId="parent-label"
                compact
              />
            </section>
          ) : null}
          {figures ? (
            <div className="band figs place-secondary">
              <OverviewMetric
                className="place-movement"
                label={t('movement')}
                value={
                  figures.askingPriceMovement.state === 'available'
                    ? formatPercentage(figures.askingPriceMovement.value / 100, locale)
                    : null
                }
                evidence={figures.askingPriceMovement}
              />
              <OverviewMetric
                className="place-days"
                label={t('days')}
                value={
                  figures.medianTimeOnMarketDays.state === 'available'
                    ? formatQuantity(figures.medianTimeOnMarketDays.value, locale)
                    : null
                }
                unit={t('daysUnit')}
                evidence={figures.medianTimeOnMarketDays}
              />
              <OverviewMetric
                className="place-reductions30"
                label={t('reductions30')}
                value={
                  figures.priceReductions.state === 'available'
                    ? formatCount(figures.priceReductions.value.count, locale)
                    : null
                }
                unit={t('listingsUnit')}
                extra={
                  figures.priceReductions.state === 'available'
                    ? t('percentageOfListings', {
                        value: formatPercentage(
                          figures.priceReductions.value.percentage / 100,
                          locale,
                        ),
                      })
                    : undefined
                }
                evidence={figures.priceReductions}
                contributorUnit="listings"
              />
              <OverviewMetric
                className="place-ratio"
                label={t('ratio')}
                value={
                  figures.listingsPerProperty.state === 'available'
                    ? formatQuantity(figures.listingsPerProperty.value, locale)
                    : null
                }
                evidence={figures.listingsPerProperty}
              />
              <OverviewMetric
                className="place-sale"
                label={t('sale')}
                value={null}
                evidence={figures.recordedSalePricePerSquareMeter}
                priceKind="sale"
                extra={t('saleReason')}
              />
            </div>
          ) : null}
        </div>
        <p className="place-disclosure">{t('preparedDisclosure')}</p>
        {place.data ? (
          <div className="place-overview-panels">
            <PlaceSeries id={id} />
            <PlaceSchematic place={place.data.place} neighbours={neighbours.data} />
            <PlaceReductions place={place.data.place} />
            <PlaceNeighbours
              data={neighbours.data}
              pending={neighbours.isPending}
              error={neighbours.error}
              retry={() => {
                void neighbours.refetch();
              }}
            />
          </div>
        ) : null}
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
