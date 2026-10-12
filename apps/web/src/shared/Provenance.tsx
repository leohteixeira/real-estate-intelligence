import type { MarketEvidence } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatComputedAt } from '../places/formatters';
import type { Locale } from '../places/locale';

export interface MethodLink {
  readonly href: string;
  readonly label: string;
}
export interface ProvenanceProps {
  readonly evidence: MarketEvidence;
  readonly synthetic: boolean;
  readonly method?: MethodLink;
}
export function Provenance({ evidence, synthetic, method }: ProvenanceProps) {
  const { t, i18n } = useTranslation('shared');
  return (
    <div className="prov place-provenance">
      <span>{t('contributors', { count: evidence.recordCount })}</span>
      <span className="prov__sources">
        {evidence.sources.map((source, index) => (
          <span key={source.id}>
            {index > 0 ? ', ' : ''}
            <a href={source.url}>
              {index === 0 ? `${t('sources')} ` : ''}
              {source.label}
            </a>
          </span>
        ))}
      </span>
      <span>
        {t('computed', { time: formatComputedAt(evidence.computedAt, i18n.language as Locale) })}
      </span>
      <span>{t(evidence.freshness.status)}</span>
      {synthetic ? <span className="tag tag--synthetic">{t('synthetic')}</span> : null}
      {method ? <a href={method.href}>{method.label}</a> : null}
    </div>
  );
}
