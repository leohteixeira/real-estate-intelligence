import { ExternalFailure, isExternalFailure, type RunExecutor } from '@rei/application';
import {
  parseRunExecutionEvidence,
  parseRunExecutionRequest,
  sameAskIdentity,
  sameAskInputs,
} from '@rei/contracts';
import type { RunExecutionEvidence, RunExecutionInput } from '@rei/domain';
import { activeAmqpTraceHeaders } from '../shared/telemetry/trace-context.js';

const OPERATION = 'run-executor.execute';
const MAX_RESPONSE_BYTES = 16_384;
export interface HttpRunExecutorConfig {
  readonly baseUrl: string;
  readonly token: string;
}

/** Fixed destination, single attempt, no redirects and no vendor errors across the port. */
export class HttpRunExecutor implements RunExecutor {
  readonly #destination: string;
  readonly #token: string;
  public constructor(
    config: HttpRunExecutorConfig,
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
        !/^[A-Za-z0-9_-]{32,128}$/.test(config.token)
      )
        throw new Error();
      this.#destination = `${url.origin}/internal/v1/runs/execute`;
      this.#token = config.token;
    } catch {
      throw new TypeError('Invalid RunExecutor configuration.');
    }
  }

  public async execute(
    input: RunExecutionInput,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<RunExecutionEvidence> {
    if (signal.aborted) throw new ExternalFailure({ kind: 'cancelled', operation: OPERATION });
    if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new ExternalFailure({ kind: 'transient', operation: OPERATION });
    let request;
    try {
      request = structuredClone(parseRunExecutionRequest(input));
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: OPERATION });
    }
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    let timer: NodeJS.Timeout | undefined;
    let abort: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () =>
        reject(
          new ExternalFailure({
            kind: signal.aborted ? 'cancelled' : 'transient',
            operation: OPERATION,
          }),
        );
      combined.addEventListener('abort', abort, { once: true });
      timer = setTimeout(
        () => controller.abort(),
        Math.min(2_147_483_647, deadlineAt - Date.now()),
      );
    });
    try {
      const result = await Promise.race([this.attempt(request, combined), stopped]);
      if (combined.aborted)
        throw new ExternalFailure({
          kind: signal.aborted ? 'cancelled' : 'transient',
          operation: OPERATION,
        });
      return result;
    } catch (error) {
      if (signal.aborted) throw new ExternalFailure({ kind: 'cancelled', operation: OPERATION });
      if (isExternalFailure(error)) throw error;
      throw new ExternalFailure({ kind: 'transient', operation: OPERATION });
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) combined.removeEventListener('abort', abort);
      controller.abort();
    }
  }

  private async attempt(
    input: RunExecutionInput,
    signal: AbortSignal,
  ): Promise<RunExecutionEvidence> {
    const response = await this.transport(this.#destination, {
      method: 'POST',
      redirect: 'manual',
      signal,
      headers: {
        ...activeAmqpTraceHeaders(),
        'content-type': 'application/json',
        authorization: `Bearer ${this.#token}`,
      },
      body: JSON.stringify(input),
    });
    if (response.status !== 200) {
      void response.body?.cancel().catch(() => {});
      const kind =
        response.status === 401
          ? 'unauthorized'
          : response.status === 403
            ? 'forbidden'
            : response.status === 429 || response.status >= 500
              ? 'transient'
              : 'rejected';
      throw new ExternalFailure({ kind, operation: OPERATION });
    }
    if (
      !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
      Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES ||
      !response.body
    ) {
      void response.body?.cancel().catch(() => {});
      throw new ExternalFailure({ kind: 'rejected', operation: OPERATION });
    }
    const reader = response.body.getReader();
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new Error();
        chunks.push(chunk.value);
      }
      const result = parseRunExecutionEvidence(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (
        result.runId !== input.runId ||
        result.threadId !== input.threadId ||
        result.step !== input.step
      )
        throw new Error();
      if (
        input.step === 'structured-price-v1' &&
        (result.step !== 'structured-price-v1' ||
          !sameAskIdentity(input, result) ||
          input.executionId !== result.executionId ||
          !sameAskInputs(input.inputs, result.receipt.inputs))
      )
        throw new Error();
      return result;
    } catch {
      throw new ExternalFailure({
        kind: signal.aborted ? 'transient' : 'rejected',
        operation: OPERATION,
      });
    } finally {
      signal.removeEventListener('abort', cancel);
      cancel();
    }
  }
}
