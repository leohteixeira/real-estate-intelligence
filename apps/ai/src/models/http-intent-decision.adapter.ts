import {
  parseIntentDecisionRequest,
  parseIntentDecisionResponse,
  strongAskCapabilityWire,
  type IntentDecisionRequest,
  type IntentDecisionResponse,
} from '@rei/contracts';
import type { IntentDecisionTransport } from './intent-decision.transport';
import { ModelExplanationFailure } from './language-model.port';
import { priceTraceHeaders } from '../graph/price-telemetry';

export class HttpIntentDecisionAdapter implements IntentDecisionTransport {
  readonly #origin: string;
  public constructor(
    origin: string,
    private readonly transport: typeof fetch = fetch,
  ) {
    const url = new URL(origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    )
      throw new ModelExplanationFailure('rejected');
    this.#origin = url.origin;
  }
  public async execute(
    untrusted: IntentDecisionRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<IntentDecisionResponse> {
    let request;
    try {
      request = parseIntentDecisionRequest(untrusted);
      strongAskCapabilityWire(grant);
    } catch {
      throw new ModelExplanationFailure('rejected');
    }
    if (signal.aborted || !Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new ModelExplanationFailure('cancelled');
    const timeout = AbortSignal.timeout(Math.min(2147483647, Math.ceil(deadlineAt - Date.now())));
    const bounded = AbortSignal.any([signal, timeout]);
    try {
      const response = await this.transport(
        `${this.#origin}/api/v1/internal/ask/runs/${request.runId}/decision`,
        {
          method: 'POST',
          redirect: 'manual',
          signal: bounded,
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
        throw new ModelExplanationFailure(response.status >= 500 ? 'transient' : 'rejected');
      }
      if (
        !response.body ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
        Number(response.headers.get('content-length') ?? 0) > 16384
      ) {
        void response.body?.cancel().catch(() => {});
        throw new ModelExplanationFailure('rejected');
      }
      const reader = response.body.getReader();
      const abort = () => {
        void reader.cancel().catch(() => {});
      };
      bounded.addEventListener('abort', abort, { once: true });
      try {
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 16384) throw new ModelExplanationFailure('rejected');
          chunks.push(part.value);
        }
        bounded.throwIfAborted();
        try {
          return parseIntentDecisionResponse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          throw new ModelExplanationFailure('rejected');
        }
      } finally {
        bounded.removeEventListener('abort', abort);
        abort();
      }
    } catch (error) {
      if (error instanceof ModelExplanationFailure) throw error;
      throw new ModelExplanationFailure(bounded.aborted ? 'cancelled' : 'transient');
    }
  }
}
