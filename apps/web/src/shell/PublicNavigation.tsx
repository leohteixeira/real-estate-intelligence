import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { destinationPath, publicRoutes } from './public-routes';
import type { PublicDestination } from './public-routes';

function DestinationIcon({ destination }: { readonly destination: PublicDestination }) {
  return (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      {destination === 'places' ? (
        <>
          <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
          <circle cx="12" cy="10" r="2.3" />
        </>
      ) : destination === 'search' ? (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M9.6 9.5a2.4 2.4 0 1 1 3.6 2.1c-.8.5-1.2 1-1.2 1.9" />
          <path d="M12 16.6v.1" />
        </>
      )}
    </svg>
  );
}

export function PublicNavigation({
  placeId,
  mobile = false,
  current,
}: {
  readonly placeId?: string;
  readonly mobile?: boolean;
  readonly current?: PublicDestination;
}) {
  const { t } = useTranslation('shell');
  const NavigationLink = current === undefined ? NavLink : Link;
  return (
    <nav
      className={mobile ? 'tabbar public-tabs' : 'public-rail-navigation'}
      aria-label={t('navigation')}
    >
      {publicRoutes.map(({ destination }) => (
        <NavigationLink
          key={destination}
          className={mobile ? undefined : 'nav'}
          to={placeId ? destinationPath(destination, placeId) : `/${destination}`}
          {...(current === undefined
            ? {}
            : { 'aria-current': destination === current ? ('page' as const) : (false as const) })}
        >
          {mobile ? (
            <span className="ind">
              <DestinationIcon destination={destination} />
            </span>
          ) : (
            <DestinationIcon destination={destination} />
          )}
          <span>{t(destination)}</span>
        </NavigationLink>
      ))}
    </nav>
  );
}
