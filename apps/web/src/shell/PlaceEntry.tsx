import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { PlacePlate } from '../places/PlacePlate';
import { LoadErrorState, LoadingState } from '../shared/SystemStates';
import { isPlaceId, PlaceReadError } from '../places/place-client';
import { placeQuery, placesQuery } from '../places/place-queries';
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
  const catalogue = useQuery({ ...placesQuery(), enabled: false });
  const knownPlace = place.data?.place ?? catalogue.data?.items.find((item) => item.id === id);
  const missing =
    place.isError &&
    place.error instanceof PlaceReadError &&
    place.error.status === 404 &&
    !place.data;
  if (place.isPending)
    return (
      <main id={`${destination}-entry`}>
        {knownPlace ? <PlacePlate place={knownPlace} destination={destination} /> : null}
        <LoadingState label={placeText('loadingPlace')} />
      </main>
    );
  return (
    <main id={`${destination}-entry`}>
      {knownPlace && !missing ? <PlacePlate place={knownPlace} destination={destination} /> : null}
      {place.isError ? (
        <div className="place-state">
          {missing ? <h1>{placeText('missingPlace')}</h1> : null}
          <LoadErrorState
            description={placeText('failedPlace')}
            context={placeText('choosePlace')}
            retry={() => {
              void place.refetch();
            }}
            {...(place.error instanceof PlaceReadError && place.error.requestId
              ? { requestId: place.error.requestId }
              : {})}
          />
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
