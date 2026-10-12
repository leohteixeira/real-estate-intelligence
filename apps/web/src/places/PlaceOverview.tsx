import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { Figure } from '../shared/Figure';
import { isPlaceId, PlaceReadError } from './place-client';
import { marketQuery, placeQuery } from './place-queries';
import { PlacePlate } from './PlacePlate';

function ValidPlaceOverview({ id }: { readonly id: string }) {
  const { t } = useTranslation();
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
          {!market.isPending && !market.isError && median?.state === 'available' ? (
            <Figure
              label={t('median')}
              labelId="median-label"
              priceKind="asking"
              minorUnits={median.value.minorUnits}
              unit="/m²"
              evidence={median}
              synthetic
            />
          ) : (
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
              ) : (
                <div role="status">
                  <h3 className="place-unavailable">{t('unavailable')}</h3>
                  <p>{t('unavailableReason')}</p>
                </div>
              )}
            </div>
          )}
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
