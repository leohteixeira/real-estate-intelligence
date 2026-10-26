import { useEffect, useRef, useState } from 'react';
import {
  parseRoutedExplainedAskCreate,
  type RoutedLiveRun,
  type RoutedExplainedAskCreate,
  type AskInputs,
} from '@rei/contracts';
import { ApiReadError } from '../api/read-error';
import { config } from '../config';
import {
  createHeadlessAskClient,
  followLiveAsk,
  type LiveAskAccepted,
} from '../headless/ask-client';
import type { OperandDraft } from './ask-view';
import { LiveAskSession } from '../headless/ask-session';

const client = createHeadlessAskClient(config.apiBaseUrl);
interface Admission {
  readonly input: RoutedExplainedAskCreate;
  readonly key: string;
  accepted?: LiveAskAccepted;
  session?: LiveAskSession;
  run?: RoutedLiveRun;
  following: boolean;
  commanding: boolean;
}
function sameEvidence(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const entries = Object.entries(left);
  return (
    entries.length === Object.keys(right).length &&
    entries.every(
      ([key, value]) => Object.hasOwn(right, key) && sameEvidence(value, Reflect.get(right, key)),
    )
  );
}
/** Memory belongs to this mounted place only; navigation aborts transport, never the run. */
export function useLiveAsk(placeId: string) {
  const lifetime = useRef<
    | {
        controller: AbortController;
        capability: string;
        threadId: string | null;
        admission?: Admission;
      }
    | undefined
  >(undefined);
  const [run, setRun] = useState<RoutedLiveRun>();
  const [operandDrafts, setOperandDrafts] = useState<Readonly<Record<string, OperandDraft>>>({});
  const [history, setHistory] = useState<readonly RoutedLiveRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [commanding, setCommanding] = useState(false);
  const [failure, setFailure] = useState<ApiReadError>();
  const [submitted, setSubmitted] = useState<string>();
  const [accepted, setAccepted] = useState(false);
  function scope() {
    if (!lifetime.current) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const capability = btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
      lifetime.current = {
        controller: new AbortController(),
        capability,
        threadId: null,
      };
    }
    return lifetime.current;
  }
  type Scope = ReturnType<typeof scope>;
  const owned = (current: Scope, admission: Admission) =>
    lifetime.current === current &&
    current.admission === admission &&
    !current.controller.signal.aborted;
  function publish(current: Scope, admission: Admission, snapshot: RoutedLiveRun) {
    if (!owned(current, admission)) return;
    if (
      snapshot.question !== admission.input.query ||
      snapshot.locale !== admission.input.locale ||
      snapshot.placeId !== admission.input.placeId
    )
      throw new ApiReadError(502);
    if (admission.run?.terminal) return;
    admission.run = snapshot;
    setRun(snapshot);
    setHistory((previous) => [...previous.filter((item) => item.id !== snapshot.id), snapshot]);
  }
  async function follow(current: Scope, admission: Admission) {
    if (admission.following || !admission.session || admission.run?.terminal) return;
    admission.following = true;
    try {
      await followLiveAsk(
        client,
        admission.session,
        current.capability,
        current.controller.signal,
        (snapshot) => publish(current, admission, snapshot),
      );
    } finally {
      admission.following = false;
    }
  }
  async function recover() {
    const current = lifetime.current;
    const admission = current?.admission;
    if (!current || !admission || admission.following || admission.commanding) return;
    // Lock before the first await: double clicks cannot create another admission.
    admission.commanding = true;
    setBusy(true);
    setFailure(undefined);
    try {
      if (!admission.accepted) {
        const response = await client.create(
          admission.input,
          current.capability,
          admission.key,
          current.controller.signal,
        );
        if (!owned(current, admission)) return;
        admission.accepted = response;
        admission.session = new LiveAskSession(response);
        current.threadId = response.threadId;
        setAccepted(true);
      }
      admission.commanding = false;
      await follow(current, admission);
    } catch (error) {
      if (owned(current, admission) && !admission.run?.terminal)
        setFailure(error instanceof ApiReadError ? error : new ApiReadError(0));
    } finally {
      admission.commanding = false;
      if (owned(current, admission)) setBusy(false);
    }
  }
  function submit(query: string, locale: 'en' | 'pt-BR'): boolean {
    const current = scope();
    if (current.admission && !current.admission.run?.terminal) return false;
    let input: RoutedExplainedAskCreate;
    try {
      input = parseRoutedExplainedAskCreate({
        mode: 'routed-text-explanation-v1',
        threadId: current.threadId,
        placeId,
        query: query.trim(),
        locale,
      });
    } catch {
      setFailure(new ApiReadError(400));
      return false;
    }
    current.admission = { input, key: crypto.randomUUID(), following: false, commanding: false };
    setRun(undefined);
    setAccepted(false);
    setSubmitted(input.query);
    void recover();
    return true;
  }
  async function command(kind: 'confirm' | 'cancel', inputs: AskInputs | null = null) {
    const current = lifetime.current;
    const admission = current?.admission;
    const identity = admission?.accepted;
    const snapshot = admission?.run;
    if (!current || !admission || !identity || snapshot?.terminal || admission.commanding) return;
    if (
      kind === 'confirm' &&
      (!snapshot || snapshot.state !== 'awaiting_confirmation' || !snapshot.decision)
    )
      return;
    admission.commanding = true;
    setCommanding(true);
    setFailure(undefined);
    try {
      const response =
        kind === 'cancel'
          ? await client.cancel(identity.runId, current.capability, current.controller.signal)
          : await client.confirm(
              { runId: identity.runId, decisionReceiptId: snapshot!.decision!.receiptId, inputs },
              current.capability,
              current.controller.signal,
            );
      if (!owned(current, admission)) return;
      const evidence = admission.run;
      if (
        response.id !== identity.runId ||
        response.basis !== identity.mode ||
        response.threadId !== identity.threadId ||
        response.question !== admission.input.query ||
        response.placeId !== admission.input.placeId ||
        response.locale !== admission.input.locale ||
        (evidence &&
          (response.createdAt !== evidence.createdAt ||
            response.principalId !== evidence.principalId ||
            !sameEvidence(response.originalInputs, evidence.originalInputs) ||
            (evidence.decision !== null && !sameEvidence(response.decision, evidence.decision)) ||
            (evidence.confirmation !== null &&
              !sameEvidence(response.confirmation, evidence.confirmation)) ||
            (evidence.confirmationDeadline !== null &&
              evidence.confirmationDeadline !== response.confirmationDeadline) ||
            evidence.steps.some((step, index) => !sameEvidence(step, response.steps[index]))))
      )
        throw new ApiReadError(502);
      // SSE owns progress. A command may return an actual terminal; older responses cannot roll it back.
      if (
        response.terminal &&
        !admission.run?.terminal &&
        response.updatedAt >= (admission.run?.updatedAt ?? '')
      )
        publish(current, admission, response);
      admission.commanding = false;
      if (!admission.following && !admission.run?.terminal) await follow(current, admission);
    } catch (error) {
      if (owned(current, admission) && !admission.run?.terminal)
        setFailure(error instanceof ApiReadError ? error : new ApiReadError(0));
    } finally {
      admission.commanding = false;
      if (owned(current, admission)) setCommanding(false);
    }
  }
  useEffect(
    () => () => {
      lifetime.current?.controller.abort();
      lifetime.current = undefined;
    },
    [],
  );
  return {
    run,
    history,
    operandDrafts,
    setOperandDrafts,
    busy,
    commanding,
    failure,
    submitted,
    accepted,
    submit,
    recover,
    command,
    blocked: submitted !== undefined && !run?.terminal,
  };
}
