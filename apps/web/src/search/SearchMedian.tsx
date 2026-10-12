import type { SearchResponse } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatComputedAt, formatMedian } from '../places/formatters';
import type { Locale } from '../places/locale';

export function SearchMedian({
  result,
  comparison,
}: {
  readonly result: SearchResponse;
  readonly comparison?: { readonly name: string; readonly result: SearchResponse };
}) {
  const { t, i18n } = useTranslation('search');
  const { t: shared } = useTranslation('shared');
  const locale = i18n.language as Locale;
  return (
    <section className="band search-median" aria-labelledby="search-median-label">
      <div className="fig fig--s">
        <h2 id="search-median-label" className="fig__label">
          {t('median')} <span className="tag">{shared('asking')}</span>
        </h2>
        <p className="fig__value">
          {result.medianPricePerSquareMeter === null ? (
            t('medianUnavailable')
          ) : (
            <>
              {formatMedian(result.medianPricePerSquareMeter, locale)} <small>/m²</small>
            </>
          )}
        </p>
        <p className="prov">
          <span className="tag tag--synthetic">{t('prepared')}</span>
          <span>{t('evaluated', { time: formatComputedAt(result.metadata.asOf, locale) })}</span>
        </p>
        {comparison && comparison.result.medianPricePerSquareMeter !== null ? (
          <p className="prov">
            {t('neighborhoodMedian', {
              name: comparison.name,
              value: formatMedian(comparison.result.medianPricePerSquareMeter, locale),
            })}
          </p>
        ) : null}
        <details className="search-evidence">
          <summary>{t('evidence')}</summary>
          <p>{t('evidenceBody', { version: result.metadata.fixtureVersion })}</p>
        </details>
      </div>
    </section>
  );
}
