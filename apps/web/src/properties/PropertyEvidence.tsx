import type { PropertyResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatProbability, formatQuantity } from '../places/formatters';
import type { Locale } from '../places/locale';
import { PropertySourceLink } from './PropertySourceLink';

export function PropertyEvidence({ response }: { readonly response: PropertyResponse }) {
  const { t, i18n } = useTranslation('property');
  const { t: shared } = useTranslation('shared');
  const locale = i18n.language as Locale;
  const evidence = response.property.preparedEvidence;
  const total = response.property.listings.length;
  return (
    <section
      className="panel property-evidence"
      id="property-evidence"
      aria-labelledby="property-evidence-title"
    >
      <div className="sec">
        <h2 id="property-evidence-title">{t('evidence')}</h2>
      </div>
      <div className="property-panel-body">
        {evidence.reasons.length ? (
          <>
            <div className="spread property-probability">
              <span className="small">
                {t(evidence.kind === 'prepared-fixture' ? 'probability' : 'ruleProbability')}
              </span>
              <span className="num">
                {formatProbability(
                  evidence.kind === 'prepared-fixture'
                    ? evidence.illustrativeProbability
                    : (evidence.productionMatchScore ?? 0),
                  locale,
                )}
              </span>
            </div>
            <p className="prov">
              {t(evidence.kind === 'prepared-fixture' ? 'uncalibrated' : 'ruleUncalibrated')}
            </p>
          </>
        ) : (
          <p>{t('unresolved')}</p>
        )}
        <p className="prov">{t('participation')}</p>
        {evidence.reasons.length === 0 ? (
          <p>{t('noReasons')}</p>
        ) : (
          <ul className="property-reasons">
            {evidence.reasons.map((reason, index) => {
              const ids =
                reason.type === 'published-neighborhood-disagreement'
                  ? reason.values.map((value) => value.listingId)
                  : reason.listingIds;
              const label =
                reason.type === 'rule-comparison'
                  ? `${t(`rule_${reason.feature}`)}: ${reason.available ? formatProbability(reason.score ?? 0, locale) : t('ruleUnavailable')}`
                  : reason.type === 'attribute-agreement'
                    ? `${t(reason.field)}: ${reason.field === 'propertyType' ? shared(String(reason.value)) : typeof reason.value === 'number' ? formatQuantity(reason.value, locale) : reason.value}${reason.field === 'areaSquareMeters' ? ' m²' : ''}`
                    : reason.type === 'shared-structured-feature'
                      ? t(reason.feature, { defaultValue: reason.feature })
                      : t('disagreement');
              return (
                <li key={index}>
                  <div className="ev">
                    <span>{label}</span>
                    <span className="bar" aria-hidden="true">
                      <i style={{ width: `${total ? (ids.length / total) * 100 : 0}%` }} />
                    </span>
                    <span>{t('participants', { count: ids.length, total })}</span>
                  </div>
                  {reason.type === 'published-neighborhood-disagreement' ? (
                    <p className="small">
                      {reason.values
                        .map(
                          (value) =>
                            `${response.property.listings.find((listing) => listing.id === value.listingId)?.source.label ?? value.listingId}: ${value.neighborhood}`,
                        )
                        .join(' · ')}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <details className="property-reason-details">
          <summary>{t('reasonDetails')}</summary>
          <p className="prov">
            {t(evidence.kind === 'prepared-fixture' ? 'rawEvidenceLabel' : 'ruleEvidenceLabel')}:{' '}
            {evidence.label}
          </p>
          <ol>
            {evidence.reasons.map((reason, index) => {
              const ids =
                reason.type === 'published-neighborhood-disagreement'
                  ? reason.values.map((value) => value.listingId)
                  : reason.listingIds;
              const label =
                reason.type === 'rule-comparison'
                  ? `${t(`rule_${reason.feature}`)}: ${reason.available ? formatProbability(reason.score ?? 0, locale) : t('ruleUnavailable')}`
                  : reason.type === 'attribute-agreement'
                    ? t(reason.field)
                    : reason.type === 'shared-structured-feature'
                      ? t(reason.feature, { defaultValue: reason.feature })
                      : t('disagreement');
              return (
                <li key={index}>
                  <strong>{label}</strong>
                  <ul>
                    {ids.map((id) => (
                      <li key={id}>
                        <PropertySourceLink listingId={id}>
                          {response.property.listings.find((listing) => listing.id === id)?.source
                            .label ?? id}
                        </PropertySourceLink>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </details>
        <p className="small muted">
          {t(evidence.kind === 'prepared-fixture' ? 'imageUnavailable' : 'ruleImages')}
        </p>
      </div>
    </section>
  );
}
