import { ExternalFailure, isExternalFailure, type RunDispatch } from '@rei/application';
import {
  parseAskClaim,
  parseAskCompletion,
  parseAskLiveRun,
  parseAskRequestedIdentity,
  sameAskIdentity,
} from '@rei/contracts';
import type { AskClaim, AskCompletion, AskLiveRun, AskRequestedIdentity } from '@rei/domain';
import { askDispatchProof } from './ask-authority.js';
import { activeAmqpTraceHeaders } from '../shared/telemetry/trace-context.js';
// 16,000 query code units may escape to 96,000 JSON bytes; a slug adds 20,000.
// Leave bounded headroom for the terminal run and its claim identity wrapper.
const ASK_DISPATCH_RESPONSE_LIMIT_BYTES = 128 * 1024;
export interface HttpRunDispatchConfig {
  readonly baseUrl: string;
  readonly secret: string;
}
export class HttpRunDispatch implements RunDispatch {
  readonly #origin: string;
  readonly #secret: string;
  public constructor(
    config: HttpRunDispatchConfig,
    private readonly transport: typeof fetch = fetch,
  ) {
    try {
      const url = new URL(config.baseUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        url.pathname !== '/' ||
        !/^[A-Za-z0-9_-]{43,128}$/.test(config.secret)
      )
        throw new Error();
      this.#origin = url.origin;
      this.#secret = config.secret;
    } catch {
      throw new TypeError('Invalid Ask dispatch configuration.');
    }
  }
  public async claim(
    identity: AskRequestedIdentity,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<AskClaim> {
    parseAskRequestedIdentity(identity);
    const response = await this.post('claim', identity, signal, deadlineAt);
    let result: AskClaim;
    try {
      result = parseAskClaim(response);
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: 'run-dispatch.claim' });
    }
    if (!sameAskIdentity(result.identity, identity))
      throw new ExternalFailure({ kind: 'rejected', operation: 'run-dispatch.claim' });
    return structuredClone(result);
  }
  public async complete(
    request: AskCompletion,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<AskLiveRun> {
    parseAskCompletion(request);
    const response = await this.post('complete', request, signal, deadlineAt);
    let result: AskLiveRun;
    try {
      result = parseAskLiveRun(response);
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: 'run-dispatch.complete' });
    }
    if (
      result.id !== request.runId ||
      result.threadId !== request.threadId ||
      result.state !== (request.evidence ? 'completed' : 'failed')
    )
      throw new ExternalFailure({ kind: 'rejected', operation: 'run-dispatch.complete' });
    return structuredClone(result);
  }
  private async post(
    action: 'claim' | 'complete',
    request: AskRequestedIdentity,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<unknown> {
    const operation = `run-dispatch.${action}`;
    if (signal.aborted) throw new ExternalFailure({ kind: 'cancelled', operation });
    if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new ExternalFailure({ kind: 'transient', operation });
    const deadline = new AbortController();
    const combined = AbortSignal.any([signal, deadline.signal]);
    const timer = setTimeout(
      () => deadline.abort(),
      Math.min(2_147_483_647, deadlineAt - Date.now()),
    );
    let abort: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () =>
        reject(
          new ExternalFailure({ kind: signal.aborted ? 'cancelled' : 'transient', operation }),
        );
      combined.addEventListener('abort', abort, { once: true });
    });
    const attempt = async (): Promise<unknown> => {
      const response = await this.transport(
        `${this.#origin}/api/v1/internal/ask/runs/${request.runId}/${action}`,
        {
          method: 'POST',
          redirect: 'manual',
          signal: combined,
          headers: {
            ...activeAmqpTraceHeaders(),
            'content-type': 'application/json',
            authorization: `Bearer ${askDispatchProof(this.#secret, request)}`,
          },
          body: JSON.stringify(request),
        },
      );
      if (
        response.status !== 200 ||
        !response.body ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
        Number(response.headers.get('content-length') ?? 0) > ASK_DISPATCH_RESPONSE_LIMIT_BYTES
      ) {
        void response.body?.cancel().catch(() => {});
        throw new ExternalFailure({
          kind: response.status >= 500 || response.status === 429 ? 'transient' : 'rejected',
          operation,
        });
      }
      const reader = response.body.getReader();
      const cancel = () => {
        void reader.cancel().catch(() => {});
      };
      combined.addEventListener('abort', cancel, { once: true });
      try {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > ASK_DISPATCH_RESPONSE_LIMIT_BYTES) throw new Error();
          chunks.push(chunk.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } finally {
        combined.removeEventListener('abort', cancel);
        cancel();
      }
    };
    try {
      return await Promise.race([attempt(), stopped]);
    } catch (error) {
      if (signal.aborted) throw new ExternalFailure({ kind: 'cancelled', operation });
      if (isExternalFailure(error)) throw error;
      throw new ExternalFailure({ kind: 'rejected', operation });
    } finally {
      clearTimeout(timer);
      if (abort) combined.removeEventListener('abort', abort);
      deadline.abort();
    }
  }
}
