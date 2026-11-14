import type { PropertyResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatQuantity } from '../places/formatters';
import type { Locale } from '../places/locale';
import { propertyNeighborhood } from './property-navigation';
import { propertyStreet } from './property-presentation';
import { placeName } from '../places/locale';

export function PropertyPlate({ response }: { readonly response: PropertyResponse }) {
  const { t, i18n } = useTranslation('property');
  const { t: shared } = useTranslation('shared');
  const { t: placeText } = useTranslation('place');
  const locale = i18n.language as Locale;
  const summary = response.property.summary;
  const street = propertyStreet(response, i18n.language);
  const neighborhood = propertyNeighborhood(summary);
  const city = summary.breadcrumbs.find((place) => place.kind === 'city');
  const zone = summary.breadcrumbs.find((place) => place.kind === 'zone');
  const stripPlace = zone ?? neighborhood;
  return (
    <header className="shell place-head property-head">
      <nav className="property-location" aria-label={placeText('hierarchy')}>
        {neighborhood ? (
          <Link to={`/search/${neighborhood.id}`}>
            {placeName(neighborhood.name, i18n.language)}
          </Link>
        ) : null}
        <details className="property-ancestry">
          <summary>{t('ancestry')}</summary>
          <ol className="crumbs">
            {summary.breadcrumbs
              .filter((place) => place.id !== summary.place.id)
              .map((place) => (
                <li key={place.id}>
                  <Link to={`/search/${place.id}`}>{placeName(place.name, i18n.language)}</Link>
                </li>
              ))}
            <li aria-current="page">{placeName(summary.place.name, i18n.language)}</li>
          </ol>
        </details>
      </nav>
      <div className="place-head__content">
        <div
          className={`plate plate--block place-plate place-plate--${zone?.id.split('-').at(-1) ?? 'city'}`}
        >
          <div className="plate__in">
            <div className="plate__over">
              <span>
                {[neighborhood, city]
                  .flatMap((place) => (place ? [placeName(place.name, i18n.language)] : []))
                  .join(' · ')}
              </span>
              <span>{t('title')}</span>
            </div>
            <h1 className="plate__name">{street}</h1>
            <div className="plate__strip">
              <span>
                {stripPlace ? placeName(stripPlace.name, i18n.language) : placeText('street-block')}
              </span>
              <span>{placeText('synthetic')}</span>
            </div>
          </div>
        </div>
        <div className="property-summary">
          <p>
            {shared(summary.propertyType)} ·{' '}
            {(['bedrooms', 'bathrooms', 'parkingSpaces'] as const)
              .map(
                (field) =>
                  `${t(field)}: ${summary[field] === null ? t('unknown') : formatQuantity(summary[field], locale)}`,
              )
              .join(' · ')}{' '}
            ·{' '}
            {summary.areaSquareMeters === null
              ? shared('areaUnavailable')
              : `${formatQuantity(summary.areaSquareMeters, locale)} m²`}
          </p>
          <p className="small">{t('unitNote')}</p>
          {neighborhood ? (
            <Link
              className="btn btn--primary"
              to={`/ask/${neighborhood.id}`}
              state={{
                placeId: neighborhood.id,
                questionDraft: t('draft', {
                  id: summary.id,
                  block: street,
                  neighborhood: placeName(neighborhood.name, i18n.language),
                }),
              }}
            >
              {t('ask')}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
