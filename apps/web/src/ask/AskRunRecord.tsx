import type { AskRun } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { formatComputedAt, formatExactMoney } from '../places/formatters';
import type { Locale } from '../places/locale';
import { destinationPath } from '../shell/public-routes';

/** Preserve every received significant digit, including subnormal positive operands. */
function formatArea(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    maximumSignificantDigits: 21,
  }).format(value);
}

export function AskRunRecord({ run, placeId }: { readonly run: AskRun; readonly placeId: string }) {
  const { t, i18n } = useTranslation('ask');
  const locale = i18n.language as Locale;
  const result = run.result;
  return (
    <article className="ask-record panel" aria-labelledby="ask-record-question">
      <div className="ask-record__head">
        <div className="spread">
          <span
            className={`st ${run.state === 'completed' ? 'st--ok' : run.state === 'running' ? 'st--running' : run.state === 'failed' ? 'st--fail' : ''}`}
          >
            {t(run.state)}
          </span>
          <time className="small muted" dateTime={run.updatedAt}>
            {formatComputedAt(run.updatedAt, locale)}
          </time>
        </div>
        <h2 id="ask-record-question">{run.question}</h2>
        <p className="ask-origin">{t('origin')}</p>
        <p className="ask-origin">
          {run.placeId === null ? t('unscoped') : t('fixturePlace', { id: run.placeId })}
        </p>
      </div>
      <div className="ask-record__result">
        <div className="fig">
          {result?.kind === 'price_per_square_meter' ? (
            <>
              <p className="fig__label">
                {t('result')} <span className="tag">{t('asking')}</span>
              </p>
              <p className="fig__value">
                {formatExactMoney(result.minorUnits, locale)} <small>/m²</small>
              </p>
              <p className="small">
                {formatExactMoney(result.inputs.priceMinorUnits, locale)} ÷{' '}
                {formatArea(result.inputs.areaSquareMeters, locale)} m²
              </p>
              <p className="prov">
                {t('computed')}{' '}
                <time dateTime={result.computedAt}>
                  {formatComputedAt(result.computedAt, locale)}
                </time>
              </p>
              <p className="ask-origin">
                {t('deterministic')} {t('noSale')}
              </p>
            </>
          ) : result?.kind === 'unavailable_intent' ? (
            <>
              <p className="ask-unavailable">{t('unavailableResult')}</p>
              <Link className="btn" to={destinationPath('search', placeId)}>
                {t('search')}
              </Link>
            </>
          ) : (
            <p className="muted">{t('noResult')}</p>
          )}
          <p className="ask-origin">{t('noCitations')}</p>
        </div>
        <div className="ask-explanation">
          <div className="note">
            <div>
              <strong>{t('explanation')}</strong>
              <p>{t('explanationAbsence')}</p>
            </div>
          </div>
        </div>
      </div>
      <section className="ask-record__steps" aria-labelledby="ask-steps-title">
        <h3 id="ask-steps-title">{t('steps')}</h3>
        {run.steps.length ? (
          <ol className="steps small">
            {run.steps.map((step) => (
              <li key={step.sequence}>
                <div>
                  <h4>{t(step.phase)}</h4>
                  <time className="muted" dateTime={step.at}>
                    {formatComputedAt(step.at, locale)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t('noSteps')}</p>
        )}
      </section>
      <details className="ask-identifiers">
        <summary>{t('identifiers')}</summary>
        <dl className="kv">
          <dt>{t('runId')}</dt>
          <dd>{run.id}</dd>
          <dt>{t('threadId')}</dt>
          <dd>{run.threadId}</dd>
          <dt>{t('created')}</dt>
          <dd>
            <time dateTime={run.createdAt}>{formatComputedAt(run.createdAt, locale)}</time>
          </dd>
          <dt>{t('asOf')}</dt>
          <dd>
            <time dateTime={run.metadata.asOf}>{formatComputedAt(run.metadata.asOf, locale)}</time>
          </dd>
        </dl>
      </details>
    </article>
  );
}
