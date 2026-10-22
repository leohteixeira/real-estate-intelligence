import type { PropertyResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatQuantity } from '../places/formatters';
import type { Locale } from '../places/locale';
import { PropertySourceLink } from './PropertySourceLink';

export function PropertyFeatures({ response }: { readonly response: PropertyResponse }) {
  const { t, i18n } = useTranslation('property');
  const { t: shared } = useTranslation('shared');
  const locale = i18n.language as Locale;
  const property = response.property;
  return (
    <section className="panel property-features" aria-labelledby="property-features-title">
      <div className="sec">
        <h2 id="property-features-title">{t('features')}</h2>
      </div>
      <div className="property-panel-body">
        <dl className="kv">
          {(
            ['propertyType', 'areaSquareMeters', 'bedrooms', 'bathrooms', 'parkingSpaces'] as const
          ).map((field) => (
            <div key={field} className="property-agreement-row">
              <dt>{t(field)}</dt>
              <dd>
                {property.summary[field] === null
                  ? t('unknown')
                  : field === 'propertyType'
                    ? shared(property.summary[field])
                    : `${formatQuantity(property.summary[field], locale)}${field === 'areaSquareMeters' ? ' m²' : ''}`}
              </dd>
            </div>
          ))}
          <div className="property-agreement-row">
            <dt>{t('floor')}</dt>
            <dd>{t('unknown')}</dd>
          </div>
        </dl>
        <details className="property-attribute-details">
          <summary>{t('attributeDetails')}</summary>
          <dl className="kv">
            {property.sourceAgreement.map((row) => (
              <div key={row.field} className="property-agreement-row">
                <dt>{t(row.field)}</dt>
                <dd>
                  <span className="small">{t(row.agrees ? 'agreement' : 'disagreementLabel')}</span>
                  <ul>
                    {row.values.map((value) => (
                      <li key={value.listingId}>
                        <PropertySourceLink listingId={value.listingId}>
                          {property.listings.find((listing) => listing.id === value.listingId)
                            ?.source.label ?? value.sourceId}
                        </PropertySourceLink>
                        :{' '}
                        {value.value === null
                          ? t('unknown')
                          : row.field === 'propertyType'
                            ? shared(String(value.value))
                            : typeof value.value === 'number'
                              ? formatQuantity(value.value, locale)
                              : value.value}
                        {row.field === 'areaSquareMeters' && value.value !== null ? ' m²' : ''}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
          {property.sourceAgreement.length === 0 ? <p>{t('noAgreement')}</p> : null}
        </details>
        <ul className="property-feature-list">
          {property.featureAgreement.map((feature) => (
            <li key={feature.feature}>
              <div className="spread">
                <h3>{t(feature.feature, { defaultValue: feature.feature })}</h3>
                <span className="small">
                  {t('reporting', {
                    count: feature.reportingCount,
                    total: property.listings.length,
                    percent: formatQuantity(feature.reportingPercent, locale),
                  })}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <details className="property-feature-details">
          <summary>{t('featureDetails')}</summary>
          {property.featureAgreement.map((feature) => (
            <div className="property-feature-source" key={feature.feature}>
              <h3>{t(feature.feature, { defaultValue: feature.feature })}</h3>
              <p>
                {t('reporters')}:{' '}
                {property.listings
                  .filter((listing) => feature.listingIds.includes(listing.id))
                  .map((listing) => listing.source.label)
                  .join(' · ') || t('unknown')}
              </p>
              <p>
                {t('nonReporters')}:{' '}
                {property.listings
                  .filter((listing) => !feature.listingIds.includes(listing.id))
                  .map((listing) => listing.source.label)
                  .join(' · ') || '—'}
              </p>
              <p className="prov">{t('absentReport')}</p>
            </div>
          ))}
        </details>
        {property.featureAgreement.length === 0 ? <p>{t('noFeatures')}</p> : null}
      </div>
    </section>
  );
}
