import type { PlaceDetail } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { destinationPath } from '../shell/public-routes';
import type { PublicDestination } from '../shell/public-routes';
import type { ReactNode } from 'react';

export function PlacePlate({
  place,
  destination = 'places',
  children,
}: {
  readonly place: PlaceDetail;
  readonly destination?: PublicDestination;
  readonly children?: ReactNode;
}) {
  const { t } = useTranslation('place');
  const city = place.breadcrumbs.find((item) => item.kind === 'city');
  const zone = place.breadcrumbs.find((item) => item.kind === 'zone');
  const zoneKey = zone?.id.split('-').at(-1);
  return (
    <header className="shell place-head">
      <nav aria-label={t('hierarchy')}>
        <ol className="crumbs">
          {place.breadcrumbs
            .filter((crumb) => crumb.id !== place.id)
            .map((crumb) => (
              <li key={crumb.id}>
                <Link to={destinationPath(destination, crumb.id)}>{crumb.name.ptBR}</Link>
              </li>
            ))}
          <li aria-current="page">{place.name.ptBR}</li>
        </ol>
      </nav>
      <div className="place-head__content">
        <div
          className={`plate place-plate place-plate--${zoneKey ?? 'city'} ${place.kind === 'city' ? 'plate--city' : ''}`}
        >
          <div className="plate__in">
            <div className="plate__over">
              <span>{city?.name.ptBR ?? place.breadcrumbs.at(-1)?.name.ptBR}</span>
              <span>{t(place.kind)}</span>
            </div>
            <h1 className="plate__name">{place.name.ptBR}</h1>
            <div className="plate__strip">
              <span>{zone?.name.ptBR ?? t(place.kind)}</span>
              <span className="place-plate__synthetic">{t('synthetic')}</span>
            </div>
          </div>
        </div>
        {children ? <div className="place-question-region">{children}</div> : null}
      </div>
    </header>
  );
}
