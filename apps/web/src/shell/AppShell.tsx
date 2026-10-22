import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useMatch } from 'react-router';
import { LocaleControls } from '../places/LocaleControls';
import {
  placesQuery,
  propertyQuery,
  listingQuery,
  listingPropertyQuery,
} from '../places/place-queries';
import { verifiedListingProperty } from '../listings/listing-context';
import { isPropertyId, propertyNeighborhood } from '../properties/property-navigation';
import { isPlaceId, PlaceReadError } from '../places/place-client';
import { LoadErrorState } from '../shared/SystemStates';
import { PublicNavigation } from './PublicNavigation';
import { defaultPlaceId, destinationPath, publicRoutes } from './public-routes';

export function AppShell({ documentMode = false }: { readonly documentMode?: boolean }) {
  const { t, i18n } = useTranslation('shell');
  const location = useLocation();
  const filtersOpen = new URLSearchParams(location.search).get('view') === 'filters';
  const route = `${location.pathname}:${String(filtersOpen)}`;
  const previousRoute = useRef(route);
  useEffect(() => {
    if (previousRoute.current === route) return;
    const wasFilters = previousRoute.current.endsWith(':true');
    previousRoute.current = route;
    if (location.hash) return;
    const target = filtersOpen
      ? document.getElementById('filters-title')
      : wasFilters
        ? document.getElementById('search-filters-link')
        : document.getElementById('public-content');
    (target ?? document.getElementById('public-content'))?.focus();
  }, [route, filtersOpen, location.hash]);
  const { t: placeText } = useTranslation('place');
  const match = useMatch('/:destination/:placeId');
  const propertyMatch = useMatch('/properties/:propertyId');
  const listingMatch = useMatch('/listings/:listingId');
  const detailMatch = propertyMatch !== null || listingMatch !== null;
  const listing = useQuery({
    ...listingQuery(listingMatch?.params.listingId ?? ''),
    enabled: listingMatch !== null && isPropertyId(listingMatch.params.listingId),
  });
  const contextId = propertyMatch?.params.propertyId ?? listing.data?.listing.propertyId;
  const directProperty = useQuery({
    ...propertyQuery(contextId ?? ''),
    enabled: propertyMatch !== null && isPropertyId(contextId),
  });
  const listingProperty = useQuery({
    ...listingPropertyQuery(contextId ?? ''),
    enabled: listingMatch !== null && isPropertyId(contextId),
  });
  const property = listingMatch ? listingProperty : directProperty;
  const verified = listingMatch
    ? verifiedListingProperty(listing.data?.listing, property.data)
    : property.data;
  const propertyPlace = verified ? propertyNeighborhood(verified.property.summary) : undefined;
  const destination =
    publicRoutes.find((route) => route.destination === match?.params.destination?.toLowerCase())
      ?.destination ?? (detailMatch ? 'search' : 'places');
  const placeId = documentMode
    ? undefined
    : detailMatch
      ? propertyPlace?.id
      : isPlaceId(match?.params.placeId)
        ? match.params.placeId
        : defaultPlaceId;
  const places = useQuery({
    ...placesQuery(),
    enabled: !documentMode && !detailMatch && (match === null || isPlaceId(match.params.placeId)),
  });
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${t(documentMode ? 'privacy' : destination)} · Real Estate Intelligence`;
  }, [destination, documentMode, i18n.language, t]);
  return (
    <div
      className={`rei place-app${detailMatch ? ' property-app' : ''}${listingMatch ? ' listing-app' : ''}`}
    >
      <a
        className="public-skip"
        href="#public-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('public-content')?.focus();
        }}
      >
        {t('skip')}
      </a>
      <aside className="rail place-rail">
        <Link className="brand" to="/">
          Real Estate
          <br />
          Intelligence
        </Link>
        <PublicNavigation
          {...(placeId ? { placeId } : {})}
          {...(detailMatch ? { current: 'search' } : {})}
        />
        <div className="rail__foot">
          <LocaleControls />
          <p>{t('synthetic')}</p>
          <Link className="privacy-footer-link" to="/privacy">
            {t('privacy')}
          </Link>
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
        {detailMatch || documentMode ? null : (
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
        <div id="public-content" tabIndex={-1}>
          <Outlet />
        </div>
        <footer className="public-footer">
          <LocaleControls />
          <p>{t('synthetic')}</p>
          <Link className="privacy-footer-link" to="/privacy">
            {t('privacy')}
          </Link>
        </footer>
        <PublicNavigation
          {...(placeId ? { placeId } : {})}
          {...(detailMatch ? { current: 'search' } : {})}
          mobile
        />
      </div>
    </div>
  );
}
