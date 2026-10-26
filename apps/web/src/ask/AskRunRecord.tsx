import type { AskPresentedRun } from './ask-view';
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

export function AskRunRecord({
  run,
  placeId,
}: {
  readonly run: AskPresentedRun;
  readonly placeId: string;
}) {
  const { t, i18n } = useTranslation('ask');
  const locale = i18n.language as Locale;
  const result = run.result;
  const live = run.basis !== 'prepared-ask-example';
  const explanation = run.basis === 'routed-text-explanation-v1' ? run.explanation : null;
  const confirmedAt = run.confirmation
    ? 'at' in run.confirmation
      ? run.confirmation.at
      : run.confirmation.confirmedAt
    : null;
  return (
    <article className="ask-record panel" aria-labelledby="ask-record-question">
      <div className="ask-record__head">
        <div className="spread">
          <span
            className={`st ${run.state === 'completed' ? 'st--ok' : run.state === 'running' ? 'st--running' : run.state === 'failed' ? 'st--fail' : run.state === 'awaiting_confirmation' ? 'st--wait' : ''}`}
          >
            {t(run.state)}
          </span>
          <time className="small muted" dateTime={run.updatedAt}>
            {formatComputedAt(run.updatedAt, locale)}
          </time>
        </div>
        <h2 id="ask-record-question">{run.question}</h2>
        <p className="ask-origin">{t(live ? 'liveOrigin' : 'origin')}</p>
        <p className="ask-origin">
          {run.placeId === null
            ? t(live ? 'liveUnscoped' : 'unscoped')
            : t(live ? 'livePlace' : 'fixturePlace', { id: run.placeId })}
        </p>
      </div>
      {run.terminal ? (
        <p className="ask-terminal-reason">
          {live
            ? t(run.terminal.reason === null ? 'liveCompleted' : `live_${run.terminal.reason}`)
            : run.terminal.reason === null
              ? t('reasonCompleted')
              : t(run.terminal.reason)}
        </p>
      ) : null}
      {run.confirmation ? (
        <section className="ask-recorded-confirmation" aria-labelledby="ask-recorded-title">
          <h3 id="ask-recorded-title">{t(live ? 'liveConfirmedInputs' : 'recordedInputs')}</h3>
          <p className="small">{t(live ? 'liveConfirmedBoundary' : 'recordedBoundary')}</p>
          <dl className="kv">
            {run.originalInputs ? (
              <>
                <dt>{t('originalInputs')}</dt>
                <dd>
                  {formatExactMoney(run.originalInputs.priceMinorUnits, locale)} ·{' '}
                  {formatArea(run.originalInputs.areaSquareMeters, locale)} m²
                </dd>
              </>
            ) : null}
            <dt>{t(live ? 'liveConfirmedInputs' : 'recordedInputs')}</dt>
            <dd>
              {run.confirmation.inputs ? (
                <>
                  {formatExactMoney(run.confirmation.inputs.priceMinorUnits, locale)} ·{' '}
                  {formatArea(run.confirmation.inputs.areaSquareMeters, locale)} m²
                </>
              ) : (
                t('missingOperands')
              )}
            </dd>
            <dt>{t('confirmed')}</dt>
            <dd>
              <time dateTime={confirmedAt!}>{formatComputedAt(confirmedAt!, locale)}</time>
            </dd>
          </dl>
        </section>
      ) : null}
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
              <p className="ask-unavailable">{t(live ? 'liveUnavailable' : 'unavailableResult')}</p>
              <p className="small">{t('recognizedUnavailable')}</p>
              <Link className="btn" to={destinationPath('search', placeId)}>
                {t('search')}
              </Link>
            </>
          ) : (
            <p className="muted">{t(run.terminal ? 'terminalNoResult' : 'noResult')}</p>
          )}
          <p className="ask-origin">{t('noCitations')}</p>
        </div>
        <div className="ask-explanation">
          <div className="note">
            <div>
              <strong>{t(explanation ? 'modelWritten' : 'explanation')}</strong>
              <p>
                {explanation
                  ? explanation.text
                  : t(live ? 'liveExplanationAbsent' : 'explanationAbsence')}
              </p>
              {explanation ? (
                <dl className="kv small">
                  <dt>{t('model')}</dt>
                  <dd>{explanation.model}</dd>
                  <dt>{t('route')}</dt>
                  <dd>{explanation.route}</dd>
                  <dt>{t('accepted')}</dt>
                  <dd>
                    <time dateTime={explanation.acceptedAt}>
                      {formatComputedAt(explanation.acceptedAt, locale)}
                    </time>
                  </dd>
                  <dt>{t('toolReceipt')}</dt>
                  <dd>{explanation.toolReceiptId}</dd>
                  <dt>{t('explanationId')}</dt>
                  <dd>{explanation.explanationId}</dd>
                  <dt>{t('privacyEvidence')}</dt>
                  <dd>{explanation.privacyEvidenceId}</dd>
                </dl>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      <section className="ask-record__steps" aria-labelledby="ask-steps-title">
        <h3 id="ask-steps-title">{t('steps')}</h3>
        {run.steps.length ? (
          <ol className="steps small">
            {run.steps.map((step) => (
              <li
                key={step.sequence}
                className={step.phase === 'awaiting_confirmation' ? 'wait' : undefined}
              >
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
          {'metadata' in run ? (
            <>
              <dt>{t('asOf')}</dt>
              <dd>
                <time dateTime={run.metadata.asOf}>
                  {formatComputedAt(run.metadata.asOf, locale)}
                </time>
              </dd>
            </>
          ) : run.decision ? (
            <>
              <dt>{t('decisionReceipt')}</dt>
              <dd>{run.decision.receiptId}</dd>
              <dt>{t('decisionSource')}</dt>
              <dd>{run.decision.source}</dd>
            </>
          ) : null}
        </dl>
      </details>
    </article>
  );
}
