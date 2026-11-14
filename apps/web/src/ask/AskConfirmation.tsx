import { operandDraft, type AskPresentedRun, type OperandDraft } from './ask-view';
export type { OperandDraft } from './ask-view';
import { useTranslation } from 'react-i18next';
import { formatComputedAt, formatExactMoney } from '../places/formatters';
import type { Locale } from '../places/locale';

export function AskConfirmation({
  run,
  draft,
  onChange,
  onRephrase,
  onConfirm,
  busy = false,
  invalid = false,
}: {
  readonly run: AskPresentedRun;
  readonly draft: OperandDraft | undefined;
  readonly onChange: (value: OperandDraft) => void;
  readonly onRephrase: () => void;
  readonly onConfirm?: (draft: OperandDraft) => void;
  readonly busy?: boolean;
  readonly invalid?: boolean;
}) {
  const { t, i18n } = useTranslation('ask');
  const original = run.originalInputs;
  const decision = run.decision;
  const live = run.basis !== 'prepared-ask-example';
  if (!decision || (!live && !original)) return null;
  const confidence = 'probability' in decision ? decision.probability : decision.confidence;
  const locale = i18n.language as Locale;
  const number = new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    maximumSignificantDigits: 21,
  });
  const initial = operandDraft(original);
  const values = draft ?? initial;
  const awaitingConfirmation = run.state === 'awaiting_confirmation';
  // Only a price proposal has operands to check; any other live intent is confirmed as it is.
  const operands = !live || decision.intent === 'price_per_square_meter';
  return (
    <section
      className={`ask-confirmation band${awaitingConfirmation ? '' : ' ask-confirmation--recorded'}`}
      aria-labelledby="ask-proposal-title"
    >
      <h2 id="ask-proposal-title">{t(awaitingConfirmation ? 'proposal' : 'historicalProposal')}</h2>
      <p>
        {t(awaitingConfirmation ? 'proposalQuestion' : 'historicalIntent', {
          intent: t(decision.intent === 'unavailable' ? 'unavailableIntent' : decision.intent),
        })}
      </p>
      <div className="ask-confidence">
        <p>
          {t('confidence')}: <strong>{number.format(confidence)}</strong> · {t('threshold')}:{' '}
          <strong>{number.format(0.85)}</strong>
        </p>
        <div
          className="gate"
          role="img"
          aria-label={t('gateLabel', {
            confidence: number.format(confidence),
            threshold: number.format(0.85),
          })}
        >
          <i className="gate__mark" style={{ left: `${confidence * 100}%` }} />
          <i className="gate__thr" />
        </div>
      </div>
      {decision.degraded ? (
        <p className="small">{t(awaitingConfirmation ? 'degraded' : 'historicalDegraded')}</p>
      ) : null}
      {operands ? (
        <p className="small">
          {t('originalInputs')}:{' '}
          {original ? (
            <>
              {formatExactMoney(original.priceMinorUnits, locale)} ·{' '}
              {number.format(original.areaSquareMeters)} m²
            </>
          ) : (
            t('missingOperands')
          )}
        </p>
      ) : awaitingConfirmation ? (
        <p className="small">{t('proposalUnavailable')}</p>
      ) : null}
      {operands ? (
        <fieldset className="ask-operand-draft" disabled={busy || (live && !onConfirm)}>
          <legend>{t(live ? 'liveOperands' : 'operandDraft')}</legend>
          <p id="ask-operands-hint" className="small">
            {t(live ? 'liveOperandHint' : 'operandDraftHint')}
          </p>
          <div className="ask-operand-draft__fields">
            <label htmlFor="ask-price">
              {t('draftPrice')}
              <input
                id="ask-price"
                inputMode="decimal"
                type="text"
                value={values.price}
                aria-describedby="ask-operands-hint"
                aria-invalid={invalid}
                onChange={(event) => onChange({ ...values, price: event.target.value })}
              />
            </label>
            <label htmlFor="ask-area">
              {t('draftArea')}
              <input
                id="ask-area"
                inputMode="decimal"
                type="text"
                value={values.area}
                aria-describedby="ask-operands-hint"
                aria-invalid={invalid}
                onChange={(event) => onChange({ ...values, area: event.target.value })}
              />
            </label>
          </div>
          {invalid ? <p role="alert">{t('invalidOperands')}</p> : null}
          <div className="ask-confirmation__actions">
            {onConfirm ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => onConfirm(values)}
              >
                {t('confirmLive')}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => onChange(initial)}>
              {t('restoreOperands')}
            </button>
            <button type="button" className="btn" onClick={onRephrase}>
              {t('rephrase')}
            </button>
          </div>
        </fieldset>
      ) : onConfirm ? (
        <div className="ask-confirmation__actions">
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => onConfirm(values)}
          >
            {t('confirmIntent')}
          </button>
          <button type="button" className="btn" onClick={onRephrase}>
            {t('rephrase')}
          </button>
        </div>
      ) : null}
      {live && awaitingConfirmation && run.confirmationDeadline ? (
        <p className="small">
          {t('deadline')}:{' '}
          <time dateTime={run.confirmationDeadline}>
            {formatComputedAt(run.confirmationDeadline, locale)}
          </time>
        </p>
      ) : null}
    </section>
  );
}
