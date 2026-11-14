import type { PlaceDetail } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { destinationPath } from '../shell/public-routes';
import type { PublicDestination } from '../shell/public-routes';
import type { ReactNode } from 'react';
import { placeName } from './locale';

export function PlacePlate({
  place,
  destination = 'places',
  children,
}: {
  readonly place: PlaceDetail;
  readonly destination?: PublicDestination;
  readonly children?: ReactNode;
}) {
  const { t, i18n } = useTranslation('place');
  const city = place.breadcrumbs.find((item) => item.kind === 'city');
  const zone = place.breadcrumbs.find((item) => item.kind === 'zone');
  const plateCity = city ?? place.breadcrumbs.at(-1);
  const zoneKey = zone?.id.split('-').at(-1);
  return (
    <header className="shell place-head">
      <nav aria-label={t('hierarchy')}>
        <ol className="crumbs">
          {place.breadcrumbs
            .filter((crumb) => crumb.id !== place.id)
            .map((crumb) => (
              <li key={crumb.id}>
                <Link to={destinationPath(destination, crumb.id)}>
                  {placeName(crumb.name, i18n.language)}
                </Link>
              </li>
            ))}
          <li aria-current="page">{placeName(place.name, i18n.language)}</li>
        </ol>
      </nav>
      <div className="place-head__content">
        <div
          className={`plate place-plate place-plate--${zoneKey ?? 'city'} ${place.kind === 'city' ? 'plate--city' : ''}`}
        >
          <div className="plate__in">
            <div className="plate__over">
              <span>{plateCity ? placeName(plateCity.name, i18n.language) : null}</span>
              <span>{t(place.kind)}</span>
            </div>
            <h1 className="plate__name">{placeName(place.name, i18n.language)}</h1>
            <div className="plate__strip">
              <span>{zone ? placeName(zone.name, i18n.language) : t(place.kind)}</span>
              <span className="place-plate__synthetic">{t('synthetic')}</span>
            </div>
          </div>
        </div>
        {children ? <div className="place-question-region">{children}</div> : null}
      </div>
    </header>
  );
}
