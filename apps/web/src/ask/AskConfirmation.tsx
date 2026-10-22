import type { AskRun } from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { formatExactMoney } from '../places/formatters';
import type { Locale } from '../places/locale';

export interface OperandDraft {
  readonly price: string;
  readonly area: string;
}

export function AskConfirmation({
  run,
  draft,
  onChange,
  onRephrase,
}: {
  readonly run: AskRun;
  readonly draft: OperandDraft | undefined;
  readonly onChange: (value: OperandDraft) => void;
  readonly onRephrase: () => void;
}) {
  const { t, i18n } = useTranslation('ask');
  const original = run.originalInputs;
  const decision = run.decision;
  if (!original || !decision) return null;
  const locale = i18n.language as Locale;
  const number = new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
    maximumSignificantDigits: 21,
  });
  const minorUnits = BigInt(original.priceMinorUnits);
  const cents = String(minorUnits % 100n).padStart(2, '0');
  const initial = {
    price: `${minorUnits / 100n}${cents === '00' ? '' : `.${cents}`}`,
    area: String(original.areaSquareMeters),
  };
  const values = draft ?? initial;
  const awaitingConfirmation = run.state === 'awaiting_confirmation';
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
          {t('confidence')}: <strong>{number.format(decision.confidence)}</strong> ·{' '}
          {t('threshold')}: <strong>{number.format(0.85)}</strong>
        </p>
        <div
          className="gate"
          role="img"
          aria-label={t('gateLabel', {
            confidence: number.format(decision.confidence),
            threshold: number.format(0.85),
          })}
        >
          <i className="gate__mark" style={{ left: `${decision.confidence * 100}%` }} />
          <i className="gate__thr" />
        </div>
      </div>
      {decision.degraded ? (
        <p className="small">{t(awaitingConfirmation ? 'degraded' : 'historicalDegraded')}</p>
      ) : null}
      <p className="small">
        {t('originalInputs')}: {formatExactMoney(original.priceMinorUnits, locale)} ·{' '}
        {number.format(original.areaSquareMeters)} m²
      </p>
      <fieldset className="ask-operand-draft">
        <legend>{t('operandDraft')}</legend>
        <p id="ask-operands-hint" className="small">
          {t('operandDraftHint')}
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
              onChange={(event) => onChange({ ...values, area: event.target.value })}
            />
          </label>
        </div>
        <div className="ask-confirmation__actions">
          <button type="button" className="btn" onClick={() => onChange(initial)}>
            {t('restoreOperands')}
          </button>
          <button type="button" className="btn" onClick={onRephrase}>
            {t('rephrase')}
          </button>
        </div>
      </fieldset>
    </section>
  );
}
