import {
  parseCheckpointRequest,
  parseCheckpointResponse,
  strongAskCapabilityWire,
  type CheckpointRequest,
  type CheckpointResponse,
} from '@rei/contracts';
import { GraphCheckpointFailure, type GraphCheckpointTransport } from './graph-checkpoint.port';
import { priceTraceHeaders } from './price-telemetry';
export class HttpGraphCheckpointAdapter implements GraphCheckpointTransport {
  readonly #origin: string;
  public constructor(
    baseUrl: string,
    private readonly transport: typeof fetch = fetch,
  ) {
    try {
      const url = new URL(baseUrl);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error();
      this.#origin = url.origin;
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
  }
  public async execute(
    untrusted: CheckpointRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<CheckpointResponse> {
    let request: CheckpointRequest;
    try {
      request = parseCheckpointRequest(untrusted);
      strongAskCapabilityWire(grant);
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
    if (signal.aborted || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new GraphCheckpointFailure('cancelled');
    const controller = new AbortController();
    const combined = AbortSignal.any([signal, controller.signal]);
    const timer = setTimeout(
      () => controller.abort(),
      Math.min(2147483647, deadlineAt - Date.now()),
    );
    let abort: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new GraphCheckpointFailure('cancelled'));
      combined.addEventListener('abort', abort, { once: true });
    });
    const attempt = async () => {
      const response = await this.transport(
        `${this.#origin}/api/v1/ask/runs/${request.runId}/checkpoints`,
        {
          method: 'POST',
          redirect: 'manual',
          signal: combined,
          headers: {
            ...priceTraceHeaders(),
            'content-type': 'application/json',
            authorization: `Bearer ${grant}`,
          },
          body: JSON.stringify(request),
        },
      );
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        throw new GraphCheckpointFailure(
          response.status >= 500 ? 'transient' : 'rejected',
          response.status === 400
            ? 'http-invalid'
            : response.status === 403
              ? 'http-forbidden'
              : response.status === 409
                ? 'http-conflict'
                : 'http-status',
          request.operation,
        );
      }
      if (
        !response.body ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
        Number(response.headers.get('content-length') ?? 0) > 8388608
      ) {
        void response.body?.cancel().catch(() => {});
        throw new GraphCheckpointFailure('rejected', 'http-envelope', request.operation);
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
          combined.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 8388608) throw new GraphCheckpointFailure('rejected');
          chunks.push(chunk.value);
        }
        let result: CheckpointResponse;
        try {
          result = parseCheckpointResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          throw new GraphCheckpointFailure('rejected', 'http-envelope', request.operation);
        }
        if (
          result.operation !== request.operation ||
          (request.operation === 'get' &&
            request.checkpointId &&
            result.operation === 'get' &&
            result.record?.checkpointId !== request.checkpointId)
        )
          throw new GraphCheckpointFailure('rejected');
        return result;
      } finally {
        combined.removeEventListener('abort', cancel);
        cancel();
      }
    };
    try {
      return await Promise.race([attempt(), stopped]);
    } catch (error) {
      if (error instanceof GraphCheckpointFailure) throw error;
      throw new GraphCheckpointFailure(combined.aborted ? 'cancelled' : 'transient');
    } finally {
      clearTimeout(timer);
      if (abort) combined.removeEventListener('abort', abort);
      controller.abort();
    }
  }
}
