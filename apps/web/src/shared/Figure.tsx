import type { MarketEvidence } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatMedian } from '../places/formatters';
import type { Locale } from '../places/locale';
import { Provenance } from './Provenance';
import type { MethodLink } from './Provenance';

export interface FigureProps {
  readonly label: string;
  readonly labelId?: string;
  readonly priceKind: 'asking' | 'sale';
  readonly minorUnits: number;
  readonly unit?: string;
  readonly evidence: MarketEvidence;
  readonly synthetic: boolean;
  readonly method?: MethodLink;
}
export function Figure({
  label,
  labelId,
  priceKind,
  minorUnits,
  unit,
  evidence,
  synthetic,
  method,
}: FigureProps) {
  const { t, i18n } = useTranslation('shared');
  return (
    <div className="fig">
      <h2 id={labelId} className="fig__label">
        {label}{' '}
        <span className={priceKind === 'sale' ? 'tag tag--sale' : 'tag'}>{t(priceKind)}</span>
      </h2>
      <p className="fig__value">
        {formatMedian(minorUnits, i18n.language as Locale)}
        {unit ? (
          <>
            {' '}
            <small>{unit}</small>
          </>
        ) : null}
      </p>
      <Provenance evidence={evidence} synthetic={synthetic} {...(method ? { method } : {})} />
    </div>
  );
}
