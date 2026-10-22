import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useMatch } from 'react-router';
import { LocaleControls } from '../places/LocaleControls';
import { placesQuery, propertyQuery } from '../places/place-queries';
import { isPropertyId, propertyNeighborhood } from '../properties/property-navigation';
import { isPlaceId, PlaceReadError } from '../places/place-client';
import { LoadErrorState } from '../shared/SystemStates';
import { PublicNavigation } from './PublicNavigation';
import { defaultPlaceId, destinationPath, publicRoutes } from './public-routes';

export function AppShell() {
  const { t, i18n } = useTranslation('shell');
  const { t: placeText } = useTranslation('place');
  const match = useMatch('/:destination/:placeId');
  const propertyMatch = useMatch('/properties/:propertyId');
  const property = useQuery({
    ...propertyQuery(propertyMatch?.params.propertyId ?? ''),
    enabled: propertyMatch !== null && isPropertyId(propertyMatch.params.propertyId),
  });
  const propertyPlace = property.data
    ? propertyNeighborhood(property.data.property.summary)
    : undefined;
  const destination =
    publicRoutes.find((route) => route.destination === match?.params.destination?.toLowerCase())
      ?.destination ?? (propertyMatch ? 'search' : 'places');
  const placeId = propertyMatch
    ? propertyPlace?.id
    : isPlaceId(match?.params.placeId)
      ? match.params.placeId
      : defaultPlaceId;
  const places = useQuery({
    ...placesQuery(),
    enabled: propertyMatch !== null || match === null || isPlaceId(match.params.placeId),
  });
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${t(destination)} · Real Estate Intelligence`;
  }, [destination, i18n.language, t]);
  return (
    <div className={`rei place-app${propertyMatch ? ' property-app' : ''}`}>
      <aside className="rail place-rail">
        <Link className="brand" to="/">
          Real Estate
          <br />
          Intelligence
        </Link>
        <PublicNavigation
          {...(placeId ? { placeId } : {})}
          {...(propertyMatch ? { current: 'search' } : {})}
        />
        <div className="rail__foot">
          <LocaleControls />
          <p>{t('synthetic')}</p>
        </div>
      </aside>
      <div className="main place-main">
        <header className="shell place-top">
          <div className="shell__bar">
            <Link className="brand" to="/">
              Real Estate Intelligence
            </Link>
            <LocaleControls />
          </div>
        </header>
        {propertyMatch ? null : (
          <nav className="place-navigation" aria-label={placeText('navigation')}>
            <span className="place-navigation__title">{t('places')}</span>
            {places.data?.items
              .filter((place) => place.kind === 'neighborhood')
              .map((place) => (
                <NavLink key={place.id} to={destinationPath(destination, place.id)}>
                  {place.name.ptBR}
                </NavLink>
              ))}
            {places.isError ? (
              <LoadErrorState
                description={placeText('failedNavigation')}
                retry={() => {
                  void places.refetch();
                }}
                {...(places.error instanceof PlaceReadError && places.error.requestId
                  ? { requestId: places.error.requestId }
                  : {})}
              />
            ) : null}
          </nav>
        )}
        <Outlet />
        <footer className="public-footer">
          <LocaleControls />
          <p>{t('synthetic')}</p>
        </footer>
        <PublicNavigation
          {...(placeId ? { placeId } : {})}
          {...(propertyMatch ? { current: 'search' } : {})}
          mobile
        />
      </div>
    </div>
  );
}
