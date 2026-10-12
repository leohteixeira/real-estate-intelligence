import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Figure } from '../shared/Figure';
import { LoadErrorState, LoadingState, StaleFiguresNotice } from '../shared/SystemStates';
import { isPlaceId, PlaceReadError } from './place-client';
import { marketQuery, placeQuery, placesQuery } from './place-queries';
import { PlacePlate } from './PlacePlate';

function ValidPlaceOverview({ id }: { readonly id: string }) {
  const { t } = useTranslation('place');
  const catalogue = useQuery({ ...placesQuery(), enabled: false });
  const place = useQuery(placeQuery(id));
  const market = useQuery({ ...marketQuery(id), enabled: !!place.data });
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
  return (
    <main id="place-overview">
      {place.data ? <PlacePlate place={place.data.place} /> : null}
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
        <section
          className="band place-median"
          aria-labelledby="median-label"
          aria-busy={market.isPending}
        >
          {median?.state === 'available' ? (
            <>
              <StaleFiguresNotice freshness={median.freshness} />
              <Figure
                label={t('median')}
                labelId="median-label"
                priceKind="asking"
                minorUnits={median.value.minorUnits}
                unit="/m²"
                evidence={median}
                synthetic
              />
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
