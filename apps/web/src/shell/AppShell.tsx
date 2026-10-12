import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useMatch } from 'react-router';
import { LocaleControls } from '../places/LocaleControls';
import { placesQuery } from '../places/place-queries';
import { isPlaceId } from '../places/place-client';
import { PublicNavigation } from './PublicNavigation';
import { defaultPlaceId, destinationPath, publicRoutes } from './public-routes';

export function AppShell() {
  const { t, i18n } = useTranslation('shell');
  const { t: placeText } = useTranslation('place');
  const match = useMatch('/:destination/:placeId');
  const destination =
    publicRoutes.find((route) => route.destination === match?.params.destination?.toLowerCase())
      ?.destination ?? 'places';
  const placeId = isPlaceId(match?.params.placeId) ? match.params.placeId : defaultPlaceId;
  const places = useQuery(placesQuery());
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${t(destination)} · Real Estate Intelligence`;
  }, [destination, i18n.language, t]);
  return (
    <div className="rei place-app">
      <aside className="rail place-rail">
        <Link className="brand" to="/">
          Real Estate
          <br />
          Intelligence
        </Link>
        <PublicNavigation placeId={placeId} />
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
            <span role="alert">
              {placeText('failedNavigation')}{' '}
              <button
                className="btn"
                onClick={() => {
                  void places.refetch();
                }}
              >
                {placeText('retry')}
              </button>
            </span>
          ) : null}
        </nav>
        <Outlet />
        <footer className="public-footer">
          <LocaleControls />
          <p>{t('synthetic')}</p>
        </footer>
        <PublicNavigation placeId={placeId} mobile />
      </div>
    </div>
  );
}
