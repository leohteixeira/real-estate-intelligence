import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { PlacePlate } from '../places/PlacePlate';
import { isPlaceId, PlaceReadError } from '../places/place-client';
import { placeQuery } from '../places/place-queries';
import { destinationPath } from './public-routes';

type EntryDestination = 'search' | 'ask';
function ValidPlaceEntry({
  id,
  destination,
}: {
  readonly id: string;
  readonly destination: EntryDestination;
}) {
  const { t } = useTranslation(destination);
  const { t: placeText } = useTranslation('place');
  const place = useQuery(placeQuery(id));
  if (place.isPending)
    return (
      <main className="place-state" role="status">
        {placeText('loadingPlace')}
        <span className="sk" />
      </main>
    );
  return (
    <main id={`${destination}-entry`}>
      {place.data ? <PlacePlate place={place.data.place} destination={destination} /> : null}
      {place.isError ? (
        <div className="place-state" role="alert">
          <h1>
            {placeText(
              place.error instanceof PlaceReadError && place.error.status === 404
                ? 'missingPlace'
                : 'failedPlace',
            )}
          </h1>
          <p>{placeText('choosePlace')}</p>
          <button
            className="btn"
            onClick={() => {
              void place.refetch();
            }}
          >
            {placeText('retry')}
          </button>
        </div>
      ) : (
        <div className="place-body">
          <section className="band place-entry" aria-labelledby="entry-title">
            <h2 id="entry-title">{t('title')}</h2>
            <p>{t('boundary')}</p>
            <Link className="btn" to={destinationPath('places', id)}>
              {t('medianLink')}
            </Link>
          </section>
        </div>
      )}
    </main>
  );
}
export function PlaceEntry({ destination }: { readonly destination: EntryDestination }) {
  const { placeId } = useParams();
  const { t } = useTranslation('place');
  return isPlaceId(placeId) ? (
    <ValidPlaceEntry key={`${destination}:${placeId}`} id={placeId} destination={destination} />
  ) : (
    <main className="place-state" role="alert">
      <h1>{t('invalidPlace')}</h1>
      <p>{t('choosePlace')}</p>
    </main>
  );
}
