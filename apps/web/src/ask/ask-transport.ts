import { ApiReadError, publicRequestId } from '../api/read-error.js';
import {
  EventStreamDecoder,
  askStreamPolicy,
  type AdmittedFrame,
  type StreamEnvelope,
} from './ask-stream.js';

interface AskCommand {
  readonly body: unknown;
  readonly idempotencyKey?: string;
}

export const askTransportPolicy = {
  jsonDeadlineMs: 10000,
  nextFrameDeadlineMs: 10000,
  maxAutomaticReconnects: 1,
} as const;

function deadline(parent: AbortSignal, milliseconds: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener('abort', abort, { once: true });
  if (parent.aborted) abort();
  let timer: ReturnType<typeof setTimeout>;
  const renew = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new ApiReadError(408)), milliseconds);
  };
  renew();
  return {
    signal: controller.signal,
    renew,
    close() {
      clearTimeout(timer);
      parent.removeEventListener('abort', abort);
    },
  };
}

async function abortable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}

function safeError(error: unknown, signal: AbortSignal, requestId?: string): unknown {
  if (signal.aborted) return signal.reason;
  return error instanceof ApiReadError ? error : new ApiReadError(0, undefined, requestId);
}

function release(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  // Underlying cancellation may itself stall; it must not hold our deadline or reader lock open.
  void reader.cancel().catch(() => undefined);
  reader.releaseLock();
}

export function createAskTransport(baseUrl: string) {
  const base = `${baseUrl.replace(/\/$/, '')}/api/v1`;
  async function request(
    path: string,
    signal: AbortSignal,
    capability?: string,
    cursor?: string,
    stream = false,
    command?: AskCommand,
  ) {
    signal.throwIfAborted();
    const headers: Record<string, string> = {
      Accept: stream ? 'text/event-stream' : 'application/json',
    };
    if (capability) headers.Authorization = `Bearer ${capability}`;
    if (cursor) headers['Last-Event-ID'] = cursor;
    if (command) {
      headers['Content-Type'] = 'application/json';
      if (command.idempotencyKey) headers['Idempotency-Key'] = command.idempotencyKey;
    }
    const response = await abortable(
      () =>
        fetch(`${base}${path}`, {
          signal,
          headers,
          redirect: 'error',
          ...(command ? { method: 'POST', body: JSON.stringify(command.body) } : {}),
        }),
      signal,
    );
    const requestId = publicRequestId(response.headers.get('x-request-id'));
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new ApiReadError(response.status, undefined, requestId);
    }
    return response;
  }
  async function read<T>(
    path: string,
    parent: AbortSignal,
    parse: (value: unknown) => T,
    capability?: string,
    command?: AskCommand,
  ): Promise<T> {
    const scope = deadline(parent, askTransportPolicy.jsonDeadlineMs);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let requestId: string | undefined;
    try {
      const response = await request(path, scope.signal, capability, undefined, false, command);
      requestId = publicRequestId(response.headers.get('x-request-id'));
      if (!response.body) throw new ApiReadError(502, undefined, requestId);
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let body = '';
      let bytes = 0;
      for (;;) {
        const chunk = await abortable(reader.read.bind(reader), scope.signal);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > askStreamPolicy.maxBufferedBytes)
          throw new ApiReadError(502, undefined, requestId);
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      try {
        const value: unknown = JSON.parse(body);
        return parse(value);
      } catch {
        throw new ApiReadError(502, undefined, requestId);
      }
    } catch (error) {
      throw safeError(error, scope.signal, requestId);
    } finally {
      scope.close();
      if (reader) release(reader);
    }
  }
  return {
    read,
    async events<T extends StreamEnvelope>(
      id: string,
      capability: string,
      cursor: string | undefined,
      parent: AbortSignal,
      parse: (value: unknown) => T,
      onFrame: (frame: AdmittedFrame<T>) => void,
    ): Promise<void> {
      const scope = deadline(parent, askTransportPolicy.nextFrameDeadlineMs);
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await request(
          `/runs/${id}/events`,
          scope.signal,
          capability,
          cursor,
          true,
        );
        if (
          response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
            'text/event-stream' ||
          !response.body
        ) {
          void response.body?.cancel().catch(() => undefined);
          throw new ApiReadError(
            502,
            undefined,
            publicRequestId(response.headers.get('x-request-id')),
          );
        }
        reader = response.body.getReader();
        const decoder = new EventStreamDecoder(parse);
        for (;;) {
          const chunk = await abortable(reader.read.bind(reader), scope.signal);
          const admit = (frame: AdmittedFrame<T>) => {
            scope.signal.throwIfAborted();
            onFrame(frame);
            scope.signal.throwIfAborted();
            scope.renew();
          };
          const frames = chunk.done ? decoder.finish() : decoder.push(chunk.value, admit);
          if (frames.some((frame) => frame.frame.terminal) || chunk.done) return;
        }
      } catch (error) {
        throw safeError(error, scope.signal);
      } finally {
        scope.close();
        if (reader) release(reader);
      }
    },
  };
}
