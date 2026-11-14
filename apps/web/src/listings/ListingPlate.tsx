import type { ListingDetail, PropertyResponse } from '@rei/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatExactMoney, formatMedian, formatQuantity } from '../places/formatters';
import type { Locale } from '../places/locale';
import { placeName } from '../places/locale';
import { sourceName } from '../shared/api-labels';

export function ListingPlate({
  listing,
  property,
  children,
}: {
  readonly listing: ListingDetail;
  readonly property: PropertyResponse | undefined;
  readonly children: ReactNode;
}) {
  const { t, i18n } = useTranslation('listing');
  const { t: placeText } = useTranslation('place');
  const locale = i18n.language as Locale;
  const summary = property?.property.summary;
  const zone = summary?.breadcrumbs.find((place) => place.kind === 'zone');
  return (
    <header className="shell place-head property-head listing-head">
      {summary ? (
        <nav className="property-location" aria-label={placeText('hierarchy')}>
          <details className="property-ancestry">
            <summary>
              {summary.breadcrumbs
                .filter((place) => ['zone', 'neighborhood', 'block'].includes(place.kind))
                .map((place) => placeName(place.name, i18n.language))
                .join(' · ')}
            </summary>
            <ol className="crumbs">
              {summary.breadcrumbs.map((place) => (
                <li key={place.id}>
                  <Link to={`/search/${place.id}`}>{placeName(place.name, i18n.language)}</Link>
                </li>
              ))}
            </ol>
          </details>
        </nav>
      ) : null}
      <div className="place-head__content">
        <div
          className={`plate plate--block place-plate place-plate--${zone?.id.split('-').at(-1) ?? 'city'}`}
        >
          <div className="plate__in">
            <div className="plate__over">
              <span>{t('sourcePlate', { source: sourceName(listing.source, i18n) })}</span>
              <span>
                {property
                  ? t('position', {
                      position: listing.position,
                      total: property.property.listings.length,
                    })
                  : t('title')}
              </span>
            </div>
            <h1 className="plate__name">{listing.street}</h1>
            <div className="plate__strip">
              <span>{zone ? placeName(zone.name, i18n.language) : t('neighborhood')}</span>
              <span>{listing.publishedNeighborhood}</span>
            </div>
          </div>
        </div>
        {children}
        <section className="listing-asking fig" aria-labelledby="listing-asking-title">
          <h2 className="fig__label" id="listing-asking-title">
            {t('askingTitle')} <span className="tag">{t('asking')}</span>
          </h2>
          <p className="fig__value">
            {listing.askingPriceMinorUnits % 100 === 0
              ? formatMedian(listing.askingPriceMinorUnits, locale)
              : formatExactMoney(listing.askingPriceMinorUnits, locale)}
          </p>
          <p className="small listing-formula">
            {listing.areaSquareMeters === null
              ? t('metricUnknown')
              : `${formatExactMoney(listing.askingPriceMinorUnits, locale)} ÷ ${formatQuantity(listing.areaSquareMeters, locale)} m²`}{' '}
            {listing.pricePerSquareMeter === null
              ? listing.areaSquareMeters === null
                ? ''
                : t('metricUnknown')
              : `= ${formatExactMoney(listing.pricePerSquareMeter, locale)}/m²`}
          </p>
          <p className="prov">{t('deterministic')}</p>
          <details className="listing-formula-details">
            <summary>{t('formulaAction')}</summary>
            <p>{t('formula', { formula: listing.pricePerSquareMeterFormula })}</p>
          </details>
          <p className="prov">
            {sourceName(listing.source, i18n)} ·{' '}
            <time dateTime={listing.provenance.observedAt}>
              {new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
                dateStyle: 'medium',
                timeZone: 'UTC',
              }).format(new Date(listing.provenance.observedAt))}
            </time>
          </p>
        </section>
      </div>
    </header>
  );
}
