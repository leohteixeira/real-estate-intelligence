import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet } from 'react-router';
import { placesQuery } from './place-queries';
import { LocaleControls } from './LocaleControls';

export function PlaceShell() {
  const { t, i18n } = useTranslation();
  const places = useQuery(placesQuery());
  useEffect(() => {
    document.documentElement.lang = i18n.language;
    document.title = `${t('places')} · Real Estate Intelligence`;
  }, [i18n.language, t]);
  return (
    <div className="rei place-app">
      <aside className="rail place-rail">
        <Link className="brand" to="/">
          Real Estate
          <br />
          Intelligence
        </Link>
        <NavLink className="nav" to="/places">
          {t('places')}
        </NavLink>
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
        <nav className="place-navigation" aria-label={t('navigation')}>
          <span className="place-navigation__title">{t('places')}</span>
          {places.data?.items
            .filter((place) => place.kind === 'neighborhood')
            .map((place) => (
              <NavLink key={place.id} to={`/places/${place.id}`}>
                {place.name.ptBR}
              </NavLink>
            ))}
          {places.isError ? (
            <span role="alert">
              {t('failedNavigation')}{' '}
              <button
                className="btn"
                onClick={() => {
                  void places.refetch();
                }}
              >
                {t('retry')}
              </button>
            </span>
          ) : null}
        </nav>
        <Outlet />
      </div>
    </div>
  );
}
