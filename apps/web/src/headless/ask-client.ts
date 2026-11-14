import {
  parseAskCommandHeaders,
  parseAskLiveEvent,
  parseAskLiveRun,
  parseAskLiveThread,
  parseRoutedAskAccepted,
  parseRoutedAskConfirmation,
  parseRoutedAskCreate,
  parseRoutedExplainedAskAccepted,
  parseRoutedExplainedAskCreate,
  type AskLiveEvent,
  type RoutedAskAccepted,
  type RoutedAskCreateInput,
  type RoutedAskConfirmation,
  type RoutedExplainedAskAccepted,
} from '@rei/contracts';
import { ApiReadError } from '../api/read-error.js';
import { createAskTransport, askTransportPolicy } from '../ask/ask-transport.js';
import type { AdmittedFrame } from '../ask/ask-stream.js';
import { LiveAskSession } from './ask-session.js';

export type LiveAskAccepted = RoutedAskAccepted | RoutedExplainedAskAccepted;

function identifier(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value))
    throw new ApiReadError(400);
  return value;
}

function authority(value: string): string {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(value)) throw new ApiReadError(401);
  return value;
}

/** Caller owns the base, capability, creation key and lifetime; no browser persistence. */
export function createHeadlessAskClient(baseUrl: string) {
  const transport = createAskTransport(baseUrl);
  const runParser = (id: string) => (value: unknown) => {
    const run = parseAskLiveRun(value);
    if (run.id !== id) throw new ApiReadError(502);
    return run;
  };
  return {
    async create(
      input: RoutedAskCreateInput,
      capability: string,
      idempotencyKey: string,
      signal: AbortSignal,
    ): Promise<LiveAskAccepted> {
      try {
        const body =
          input.mode === 'routed-text-explanation-v1'
            ? parseRoutedExplainedAskCreate(input)
            : parseRoutedAskCreate(input);
        const key = parseAskCommandHeaders({ idempotencyKey }).idempotencyKey;
        const accepted = await transport.read(
          '/runs',
          signal,
          input.mode === 'routed-text-explanation-v1'
            ? parseRoutedExplainedAskAccepted
            : (value): LiveAskAccepted => parseRoutedAskAccepted(value),
          authority(capability),
          { body, idempotencyKey: key },
        );
        if (input.threadId !== null && accepted.threadId !== input.threadId)
          throw new ApiReadError(502);
        return accepted;
      } catch (error) {
        if (signal.aborted) throw signal.reason;
        if (error instanceof ApiReadError) throw error;
        throw new ApiReadError(400);
      }
    },
    run(id: string, capability: string, signal: AbortSignal) {
      return transport.read(
        `/runs/${identifier(id)}`,
        signal,
        runParser(id),
        authority(capability),
      );
    },
    thread(id: string, capability: string, signal: AbortSignal) {
      return transport.read(
        `/threads/${identifier(id)}`,
        signal,
        (value) => {
          const thread = parseAskLiveThread(value);
          if (thread.id !== id) throw new ApiReadError(502);
          return thread;
        },
        authority(capability),
      );
    },
    async confirm(input: RoutedAskConfirmation, capability: string, signal: AbortSignal) {
      let body: RoutedAskConfirmation;
      try {
        body = parseRoutedAskConfirmation(input);
      } catch {
        throw new ApiReadError(400);
      }
      return transport.read(
        `/runs/${identifier(input.runId)}/confirm`,
        signal,
        runParser(input.runId),
        authority(capability),
        { body },
      );
    },
    cancel(id: string, capability: string, signal: AbortSignal) {
      return transport.read(
        `/runs/${identifier(id)}/cancel`,
        signal,
        runParser(id),
        authority(capability),
        { body: { reason: 'visitor_cancelled' } },
      );
    },
    events(
      id: string,
      capability: string,
      cursor: string | undefined,
      signal: AbortSignal,
      onFrame: (frame: AdmittedFrame<AskLiveEvent>) => void,
      onHeartbeat?: () => void,
    ) {
      identifier(id);
      if (cursor !== undefined && !new RegExp(`^${id}:v1:[1-9][0-9]{0,5}$`).test(cursor))
        throw new ApiReadError(400);
      return transport.events(
        id,
        authority(capability),
        cursor,
        signal,
        parseAskLiveEvent,
        onFrame,
        onHeartbeat,
      );
    },
  };
}

/**
 * A reconnect continues the same evidence; only an explicit terminal envelope completes. A
 * connection that delivered new evidence or a heartbeat proved the run reachable, so its loss is
 * a continuation. Only consecutive connections that show no sign of life exhaust the budget.
 */
export async function followLiveAsk(
  client: ReturnType<typeof createHeadlessAskClient>,
  session: LiveAskSession,
  capability: string,
  signal: AbortSignal,
  onSnapshot: (run: NonNullable<LiveAskSession['run']>) => void,
): Promise<void> {
  if (session.terminal) return;
  for (let silent = 0; ; ) {
    let alive = false;
    try {
      await client.events(
        session.runId,
        capability,
        session.cursor,
        signal,
        (frame) => {
          if (!session.admit(frame)) return;
          alive = true;
          onSnapshot(session.run!);
        },
        () => {
          alive = true;
        },
      );
      if (session.terminal) return;
      throw new ApiReadError(0);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (!(error instanceof ApiReadError) || ![0, 408].includes(error.status)) throw error;
      silent = alive ? 0 : silent + 1;
      if (silent > askTransportPolicy.maxAutomaticReconnects) throw error;
    }
  }
}
