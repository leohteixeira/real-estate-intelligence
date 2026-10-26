import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatComputedAt } from '../places/formatters';
import type { Locale } from '../places/locale';
import { LoadErrorState } from '../shared/SystemStates';
import { AskConfirmation } from './AskConfirmation';
import { AskRunRecord } from './AskRunRecord';
import { AskThread } from './AskThread';
import { operandDraft, parseOperandDraft, type OperandDraft } from './ask-view';
import type { useLiveAsk } from './use-live-ask';

export function LiveAskPanel({
  live,
  placeId,
  onRephrase,
}: {
  readonly live: ReturnType<typeof useLiveAsk>;
  readonly placeId: string;
  readonly onRephrase: () => void;
}) {
  const { t, i18n } = useTranslation('ask');
  const [selected, setSelected] = useState<{ id: string; currentId: string | undefined }>();
  const drafts = live.operandDrafts;
  const setDrafts = live.setOperandDrafts;
  const [invalid, setInvalid] = useState(false);
  const current = live.run;
  const run =
    selected?.currentId === current?.id
      ? (live.history.find((item) => item.id === selected?.id) ?? current)
      : current;
  const failure = live.failure;
  return (
    <section className="ask-live" aria-labelledby="ask-live-title">
      <h2 id="ask-live-title">{t('liveTitle')}</h2>
      <p className="small">{t('liveHint')}</p>
      {live.submitted ? (
        <p className="ask-session-status" role="status">
          {current ? t(current.state) : t(live.accepted ? 'liveFollowing' : 'submitting')}
          {current?.terminal ? ` · ${t('terminal')}` : ''}
        </p>
      ) : null}
      {live.submitted && !current ? <p>{live.submitted}</p> : null}
      {failure ? (
        <LoadErrorState
          description={t(
            failure.status === 429
              ? 'liveQuota'
              : failure.status === 409
                ? 'liveConflict'
                : failure.status === 400
                  ? 'liveInvalid'
                  : 'liveInterrupted',
          )}
          context={t(live.accepted ? 'liveRecovery' : 'admissionRecovery')}
          retry={() => {
            void live.recover();
          }}
          {...(failure.requestId ? { requestId: failure.requestId } : {})}
        />
      ) : null}
      {failure?.quota ? (
        <p className="ask-session-status" role="status">
          {t('quotaReset', {
            scope: t(failure.quota.scope === 'global' ? 'quotaGlobal' : 'quotaVisitor'),
          })}{' '}
          <time dateTime={failure.quota.reopensAt}>
            {formatComputedAt(failure.quota.reopensAt, i18n.language as Locale)}
          </time>
        </p>
      ) : null}
      {failure?.status === 429 && !failure.quota ? (
        <p className="small">{t('quotaUnknown')}</p>
      ) : null}
      {live.accepted && !current?.terminal ? (
        <div className="ask-live-actions">
          <button
            className="btn"
            type="button"
            disabled={live.commanding}
            onClick={() => {
              void live.command('cancel');
            }}
          >
            {t('cancelLive')}
          </button>
        </div>
      ) : null}
      {live.history.length || run ? (
        <div className="ask-layout">
          <AskThread
            runs={live.history}
            selected={run?.id ?? ''}
            onSelect={(id) => {
              setSelected({ id, currentId: current?.id });
              setInvalid(false);
            }}
          />
          {run ? (
            <div className="ask-main-record">
              {run.decision && run.confirmationDeadline ? (
                <AskConfirmation
                  run={run}
                  draft={drafts[run.id]}
                  onChange={(value) => {
                    setDrafts((old) => ({ ...old, [run.id]: value }));
                    setInvalid(false);
                  }}
                  onRephrase={onRephrase}
                  busy={live.commanding}
                  invalid={invalid}
                  {...(run.id === current?.id && run.state === 'awaiting_confirmation'
                    ? {
                        onConfirm: (value: OperandDraft) => {
                          try {
                            const inputs =
                              run.decision?.intent === 'price_per_square_meter'
                                ? parseOperandDraft(value ?? operandDraft(run.originalInputs))
                                : null;
                            setInvalid(false);
                            void live.command('confirm', inputs);
                          } catch {
                            setInvalid(true);
                          }
                        },
                      }
                    : {})}
                />
              ) : null}
              <AskRunRecord run={run} placeId={placeId} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
