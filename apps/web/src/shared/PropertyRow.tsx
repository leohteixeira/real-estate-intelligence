import type { PropertySort, PropertySummary } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatComputedAt, formatCount, formatMedian, formatQuantity } from '../places/formatters';
import type { Locale } from '../places/locale';
import { placeName } from '../places/locale';

export interface PropertyRowProps {
  readonly property: PropertySummary;
  readonly href?: string;
  readonly blockLabel?: string;
  /** The applied sort: the row then always prints the contract value that ordered it. */
  readonly sortedBy?: PropertySort;
}
export function PropertyRow({ property, href, blockLabel, sortedBy }: PropertyRowProps) {
  const { t, i18n } = useTranslation('shared');
  const locale = i18n.language as Locale;
  const comparison = property.belowMedianPercent;
  const content = (
    <>
      <div>
        <p className="prow__t">
          {t(property.propertyType)} ·{' '}
          {property.bedrooms === null
            ? t('bedroomsUnavailable')
            : t('bedrooms', { count: property.bedrooms })}{' '}
          ·{' '}
          {property.areaSquareMeters === null
            ? t('areaUnavailable')
            : `${formatQuantity(property.areaSquareMeters, locale)} m²`}
        </p>
        <p className="prow__s">{blockLabel ?? placeName(property.place.name, i18n.language)}</p>
      </div>
      <div className="prow__price">
        <span className="tag">{t('asking')}</span>
        <p className="prow__p">
          {property.askingPrice === null
            ? t('askingUnavailable')
            : formatMedian(property.askingPrice.minorUnits, locale)}
        </p>
        <p className="prow__r">
          {property.pricePerSquareMeter === null
            ? t('perMeterUnavailable')
            : `${formatMedian(property.pricePerSquareMeter, locale)} /m²`}
        </p>
      </div>
      <div className="prow__m">
        {comparison === null ? null : (
          <span
            className={`prow__comparison${comparison > 0 ? ' down' : comparison < 0 ? ' up' : ''}`}
          >
            {comparison === 0
              ? t('equalMedian')
              : t(comparison > 0 ? 'belowMedian' : 'aboveMedian', {
                  value: formatQuantity(Math.abs(comparison), locale),
                })}
          </span>
        )}
        <span>
          {t('listings', {
            count: property.activeListingCount,
            formatted: formatCount(property.activeListingCount, locale),
          })}
        </span>
        {property.returnedToMarket ? <span>{t('returned')}</span> : null}
        {!property.returnedToMarket || sortedBy === 'longest-on-market' ? (
          <span>
            {t('marketDays', {
              count: property.timeOnMarketDays,
              formatted: formatCount(property.timeOnMarketDays, locale),
            })}
          </span>
        ) : null}
        {sortedBy === 'most-recent' ? (
          <span>
            {t('firstCollected', { time: formatComputedAt(property.firstCollectedAt, locale) })}
          </span>
        ) : null}
      </div>
    </>
  );
  // A router link is one native anchor: the shell keeps its state and moves focus to the content.
  return href === undefined ? (
    <div className="prow">{content}</div>
  ) : (
    <Link className="prow" to={href}>
      {content}
    </Link>
  );
}
