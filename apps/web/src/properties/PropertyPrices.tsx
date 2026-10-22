import type { PropertyResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatComputedAt, formatExactMoney, formatMedian } from '../places/formatters';
import type { Locale } from '../places/locale';
import { sourceLabel } from './property-presentation';
import { PropertySourceLink } from './PropertySourceLink';

export function PropertyPrices({ response }: { readonly response: PropertyResponse }) {
  const { t, i18n } = useTranslation('property');
  const locale = i18n.language as Locale;
  const summary = response.property.summary;
  const asking = summary.askingPrice;
  return (
    <section className="panel property-prices" aria-label={t('prices')}>
      <div className="fig">
        <h2 className="fig__label">
          {t('currentAsking')} <span className="tag">{t('asking')}</span>
        </h2>
        <p className="fig__value">
          {asking
            ? asking.minorUnits % 100 === 0
              ? formatMedian(asking.minorUnits, locale)
              : formatExactMoney(asking.minorUnits, locale)
            : t('askingUnavailable')}
        </p>
        <p className="property-per-meter small">
          {summary.pricePerSquareMeter === null
            ? t('perMeterUnavailable')
            : `${formatExactMoney(summary.pricePerSquareMeter, locale)} /m²`}
        </p>
        <p className="small muted">{t('neighborhoodUnavailable')}</p>
        <div className="prov property-price-provenance">
          <span>{t(asking ? 'minimum' : 'active', { count: summary.activeListingCount })}</span>
          {asking ? (
            <>
              <PropertySourceLink listingId={asking.listingId}>
                {sourceLabel(response, asking.provenance.sourceId)}
              </PropertySourceLink>
              <span>
                {t('observed', { date: formatComputedAt(asking.provenance.observedAt, locale) })}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div className="fig fig--s property-sale">
        <h2 className="fig__label">
          {t('salePrice')} <span className="tag tag--sale">{t('sale')}</span>
        </h2>
        <p>
          <strong>{t('noSale')}</strong>
        </p>
        <p className="prov">{t('saleNote')}</p>
      </div>
    </section>
  );
}
