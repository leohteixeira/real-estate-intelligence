import type { MarketEvidence, MarketMedian } from '@rei/contracts';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Provenance } from '../shared/Provenance';
import { formatCount, formatMedian } from './formatters';
import type { Locale } from './locale';

/** Origin/count remain scannable; each native disclosure retains its own full dated evidence. */
export function OverviewEvidence({
  evidence,
  contributorUnit = 'properties',
  origin = 'prepared',
  compactLabel,
  note,
}: {
  readonly evidence: MarketEvidence;
  readonly contributorUnit?: 'properties' | 'listings';
  readonly origin?: 'prepared' | 'live';
  readonly compactLabel?: string;
  readonly note?: string;
}) {
  const { t, i18n } = useTranslation('place');
  const locale = i18n.language as Locale;
  return (
    <>
      {compactLabel ? null : <p className="place-origin">{t(`${origin}Compact`)}</p>}
      <details className="place-figure-evidence">
        <summary>
          {compactLabel ?? (
            <>
              {t('figureEvidence')} ·{' '}
              {t(contributorUnit === 'listings' ? 'evidenceListings' : 'evidenceProperties', {
                count: evidence.recordCount,
                formattedCount: formatCount(evidence.recordCount, locale),
              })}
            </>
          )}
        </summary>
        <p className="place-origin">{t(origin)}</p>
        {note ? <p className="small">{note}</p> : null}
        <Provenance evidence={evidence} synthetic contributorUnit={contributorUnit} />
      </details>
    </>
  );
}

export function OverviewMetric({
  label,
  value,
  unit,
  evidence,
  contributorUnit = 'properties',
  className = '',
  extra,
  priceKind,
}: {
  readonly label: string;
  readonly value: string | null;
  readonly unit?: string;
  readonly evidence: MarketEvidence;
  readonly contributorUnit?: 'properties' | 'listings';
  readonly className?: string;
  readonly extra?: string;
  readonly priceKind?: 'asking' | 'sale';
}) {
  const { t } = useTranslation('place');
  const { t: shared } = useTranslation('shared');
  return (
    <div className={`fig fig--s ${className}`}>
      <h2 className="fig__label">
        {label}{' '}
        {priceKind ? (
          <span className={priceKind === 'sale' ? 'tag tag--sale' : 'tag'}>
            {shared(priceKind)}
          </span>
        ) : null}
      </h2>
      <p className={value === null ? 'place-figure-unavailable' : 'fig__value'}>
        {value ?? t(priceKind === 'sale' ? 'noneAvailable' : 'figureUnavailable')}
        {value !== null && unit ? (
          <>
            {' '}
            <small>{unit}</small>
          </>
        ) : null}
      </p>
      {extra && priceKind !== 'sale' ? <p className="small">{extra}</p> : null}
      <OverviewEvidence
        evidence={evidence}
        contributorUnit={contributorUnit}
        {...(priceKind === 'sale' && extra ? { note: extra } : {})}
      />
    </div>
  );
}
export function OverviewMedian({
  median,
  label,
  labelId,
  compact = false,
}: {
  readonly median: MarketMedian;
  readonly label: ReactNode;
  readonly labelId: string;
  readonly compact?: boolean;
}) {
  const { t, i18n } = useTranslation('place');
  return (
    <div className={compact ? 'fig fig--s' : 'fig'}>
      <h2 id={labelId} className="fig__label">
        {label} <span className="tag">{t('asking')}</span>
      </h2>
      {median.state === 'available' ? (
        <p className="fig__value">
          {formatMedian(median.value.minorUnits, i18n.language as Locale)} <small>/m²</small>
        </p>
      ) : (
        <>
          <p className="place-unavailable">{t('unavailable')}</p>
          <p className="small">{t('unavailableReason')}</p>
        </>
      )}
      <OverviewEvidence evidence={median} origin="live" />
    </div>
  );
}
