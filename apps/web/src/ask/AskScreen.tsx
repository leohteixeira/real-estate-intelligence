import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ASK_STATES,
  type AskAvailability,
  type AskRun,
  type AskState,
  type AskThread as Thread,
} from '@rei/contracts';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams } from 'react-router';
import { ApiReadError } from '../api/client';
import { PlacePlate } from '../places/PlacePlate';
import { isPlaceId, PlaceReadError } from '../places/place-client';
import { placeQuery, placesQuery, readPolicy } from '../places/place-queries';
import { LoadErrorState, LoadingState } from '../shared/SystemStates';
import { createAskClient, followAsk } from './ask-client';
import { AskSession } from './ask-session';
import { sameAskRun } from './ask-equality';
import { AskRunRecord } from './AskRunRecord';
import { AskThread } from './AskThread';
import { AskConfirmation, type OperandDraft } from './AskConfirmation';

function incomingDraft(state: unknown, id: string): string {
  if (
    state &&
    typeof state === 'object' &&
    'placeId' in state &&
    state.placeId === id &&
    'questionDraft' in state &&
    typeof state.questionDraft === 'string'
  )
    return state.questionDraft.trim();
  return '';
}
interface Authority {
  readonly key: string;
  readonly controller: AbortController;
  readonly capability: string;
  readonly session: AskSession;
}
const client = createAskClient();
function ValidAskScreen({ id }: { readonly id: string }) {
  const { t } = useTranslation('ask');
  const { t: placeText } = useTranslation('place');
  const state: unknown = useLocation().state;
  const [draft, setDraft] = useState(() => incomingDraft(state, id));
  const [run, setRun] = useState<AskRun>();
  const [thread, setThread] = useState<Thread>();
  const [availability, setAvailability] = useState<AskAvailability>();
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiReadError>();
  const [inspection, setInspection] = useState<AskState>('queued');
  const [operandDrafts, setOperandDrafts] = useState<Readonly<Record<string, OperandDraft>>>({});
  const draftInput = useRef<HTMLTextAreaElement>(null);
  const recovery = useRef({ state: 'queued' as AskState, preview: true });
  const place = useQuery(placeQuery(id));
  const catalogue = useQuery({ ...placesQuery(), enabled: false });
  const knownPlace = place.data?.place ?? catalogue.data?.items.find((item) => item.id === id);
  const cache = useQueryClient();
  const owner = useRef<{ key: string; controller: AbortController } | undefined>(undefined);
  const authority = useRef<Authority | undefined>(undefined);
  function dispose() {
    const old = owner.current;
    owner.current = undefined;
    authority.current = undefined;
    if (old) {
      old.controller.abort();
      void cache
        .cancelQueries({ queryKey: ['ask', old.key] })
        .then(() => cache.removeQueries({ queryKey: ['ask', old.key] }));
    }
  }
  useEffect(
    () => () => {
      const old = owner.current;
      if (old) {
        owner.current = undefined;
        authority.current = undefined;
        old.controller.abort();
        void cache
          .cancelQueries({ queryKey: ['ask', old.key] })
          .then(() => cache.removeQueries({ queryKey: ['ask', old.key] }));
      }
    },
    [cache],
  );
  async function readExample(state: AskState, preview: boolean, resume = false) {
    recovery.current = { state, preview };
    let current = resume ? authority.current : undefined;
    if (resume && current?.session.terminal) {
      setFailure(undefined);
      return;
    }
    let scope = resume ? owner.current : undefined;
    if (!scope) {
      dispose();
      scope = { key: crypto.randomUUID(), controller: new AbortController() };
      owner.current = scope;
      setRun(undefined);
      setThread(undefined);
      setSelected(undefined);
      setAvailability(undefined);
    }
    const owned = scope;
    const active = () => owner.current === owned && !owned.controller.signal.aborted;
    setBusy(true);
    setFailure(undefined);
    try {
      if (!current) {
        const read = <T,>(name: string, load: (signal: AbortSignal) => Promise<T>) =>
          cache.fetchQuery({
            ...readPolicy,
            queryKey: ['ask', owned.key, name],
            queryFn: ({ signal }) => load(AbortSignal.any([signal, owned.controller.signal])),
          });
        const [fixtures, supported] = await Promise.all([
          read('fixtures', (signal) => client.catalogue(signal)),
          read('availability', (signal) => client.availability(signal)),
        ]);
        const example = fixtures.items.find((item) => item.state === state);
        if (!example) throw new ApiReadError(502);
        const [snapshot, history] = await Promise.all([
          read('run', (signal) => client.run(example.runId, example.grant.capability, signal)),
          read('thread', (signal) =>
            client.thread(example.threadId, example.grant.capability, signal),
          ),
        ]);
        if (
          snapshot.id !== example.runId ||
          snapshot.state !== example.state ||
          snapshot.threadId !== example.threadId ||
          history.id !== example.threadId ||
          !sameAskRun(
            history.runs.find((item) => item.id === snapshot.id),
            snapshot,
          )
        )
          throw new ApiReadError(502);
        if (!active()) return;
        current = {
          ...owned,
          capability: example.grant.capability,
          session: new AskSession(snapshot),
        };
        authority.current = current;
        setAvailability(supported);
        setThread(history);
        setRun(snapshot);
        setSelected(snapshot.id);
      }
      if (!preview) return;
      await followAsk(
        client,
        current.session,
        current.capability,
        owned.controller.signal,
        (snapshot) => {
          if (active()) setRun(snapshot);
        },
      );
    } catch (error) {
      if (active()) setFailure(error instanceof ApiReadError ? error : new ApiReadError(0));
    } finally {
      if (active()) setBusy(false);
    }
  }
  const missing =
    place.isError &&
    place.error instanceof PlaceReadError &&
    place.error.status === 404 &&
    !place.data;
  const selectedRun =
    selected === run?.id ? run : thread?.runs.find((item) => item.id === selected);
  return (
    <main id="ask-entry" className="ask-screen">
      {knownPlace && !missing ? (
        <PlacePlate place={knownPlace} destination="ask">
          <div className="place-question ask-composer">
            <label htmlFor="ask-draft">{t('draftTitle')}</label>
            <textarea
              id="ask-draft"
              ref={draftInput}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('draftPlaceholder')}
              aria-describedby="ask-draft-hint"
            />
            <p id="ask-draft-hint" className="small">
              {t('notExecuted')}
            </p>
          </div>
        </PlacePlate>
      ) : null}
      {place.isPending ? (
        <div className="place-state">
          <LoadingState label={placeText('loadingPlace')} />
        </div>
      ) : null}
      {place.isError ? (
        <div className="place-state">
          {missing ? <h1>{placeText('missingPlace')}</h1> : null}
          <LoadErrorState
            description={placeText('failedPlace')}
            context={placeText('choosePlace')}
            retry={() => {
              void place.refetch();
            }}
            {...(place.error instanceof PlaceReadError && place.error.requestId
              ? { requestId: place.error.requestId }
              : {})}
          />
        </div>
      ) : null}
      {knownPlace && !missing ? (
        <div className="place-body ask-body">
          <section className="ask-follow" aria-labelledby="ask-follow-title">
            <div>
              <h2 id="ask-follow-title">{t('title')}</h2>
              <p>{t('navigationOnly')}</p>
              <p className="ask-origin">{t('origin')}</p>
              <p className="ask-origin">{t('followHint')}</p>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => {
                setInspection('queued');
                void readExample('queued', true);
              }}
            >
              {t('follow')}
            </button>
          </section>
          <section className="ask-inspection band" aria-labelledby="ask-inspection-title">
            <div>
              <h2 id="ask-inspection-title">{t('inspectTitle')}</h2>
              <p className="small">{t('inspectHint')}</p>
            </div>
            <div className="ask-inspection__controls">
              <label htmlFor="ask-state">{t('inspectState')}</label>
              <select
                id="ask-state"
                value={inspection}
                onChange={(event) => {
                  const state = ASK_STATES.find((item) => item === event.target.value);
                  if (state) {
                    setInspection(state);
                    void readExample(state, false);
                  }
                }}
              >
                {ASK_STATES.map((state) => (
                  <option key={state} value={state}>
                    {t(state)}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  void readExample(inspection, false);
                }}
              >
                {t('inspect')}
              </button>
            </div>
            <p className="ask-origin">{t('runtimeUnknown')}</p>
          </section>
          {busy ? (
            <p className="ask-session-status" role="status">
              {run ? t('following') : t('loading')}
            </p>
          ) : run ? (
            <p className="ask-session-status" role="status">
              {t(run.state)}
              {run.terminal ? ` · ${t('terminal')}` : ''}
            </p>
          ) : null}
          {failure ? (
            <LoadErrorState
              description={run ? t('interrupted') : t('failedRead')}
              context={t('recovery')}
              retry={() => {
                void readExample(
                  recovery.current.state,
                  recovery.current.preview,
                  Boolean(authority.current),
                );
              }}
              {...(failure.requestId ? { requestId: failure.requestId } : {})}
            />
          ) : null}
          {selectedRun && thread && run ? (
            <div className="ask-layout">
              <AskThread
                runs={thread.runs.map((item) => (item.id === run.id ? run : item))}
                selected={selectedRun.id}
                onSelect={setSelected}
              />
              <div className="ask-main-record">
                {selectedRun.decision?.requiresConfirmation && selectedRun.originalInputs ? (
                  <AskConfirmation
                    run={selectedRun}
                    draft={operandDrafts[selectedRun.id]}
                    onChange={(value) =>
                      setOperandDrafts((previous) => ({ ...previous, [selectedRun.id]: value }))
                    }
                    onRephrase={() => draftInput.current?.focus()}
                  />
                ) : null}
                {selectedRun.id === run.id && !run.terminal ? (
                  <section className="ask-preview band">
                    <p>{t('previewHint')}</p>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => {
                        void readExample(inspection, true, true);
                      }}
                    >
                      {t('readPreview')}
                    </button>
                  </section>
                ) : null}
                <AskRunRecord run={selectedRun} placeId={id} />
                {availability ? (
                  <section
                    className="panel ask-availability"
                    aria-labelledby="ask-availability-title"
                  >
                    <h2 id="ask-availability-title">{t('availability')}</h2>
                    <ul className="rows">
                      {availability.intents.map((item) => (
                        <li className="spread" key={item.intent}>
                          <span>
                            {t(item.intent === 'unavailable' ? 'unavailableIntent' : item.intent)}
                          </span>
                          <span className={`st ${item.available ? 'st--ok' : 'st--off'}`}>
                            {t(item.available ? 'available' : 'unavailable')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            </div>
          ) : !busy && !failure ? (
            <section className="band ask-idle">
              <h2>{t('idleTitle')}</h2>
              <p>{t('idleCopy')}</p>
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
export function AskScreen() {
  const { placeId } = useParams();
  const { t } = useTranslation('place');
  return isPlaceId(placeId) ? (
    <ValidAskScreen key={placeId} id={placeId} />
  ) : (
    <main className="place-state" role="alert">
      <h1>{t('invalidPlace')}</h1>
      <p>{t('choosePlace')}</p>
    </main>
  );
}
