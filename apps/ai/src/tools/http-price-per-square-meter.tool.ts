import {
  parsePriceToolReceipt,
  parsePriceToolRequest,
  sameAskIdentity,
  sameAskInputs,
  strongAskCapabilityWire,
  type PriceToolReceipt,
  type PriceToolRequest,
} from '@rei/contracts';
import { PriceToolFailure, type PricePerSquareMeterTool } from './price-per-square-meter.port';
import { priceTraceHeaders } from '../graph/price-telemetry';
/** The grant authorizes one fixed capability. The tool never receives public or dispatch authority. */
export class HttpPricePerSquareMeterTool implements PricePerSquareMeterTool {
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
      throw new PriceToolFailure();
    }
  }
  public async calculate(
    untrusted: PriceToolRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<PriceToolReceipt> {
    let request: PriceToolRequest;
    try {
      signal.throwIfAborted();
      request = structuredClone(parsePriceToolRequest(untrusted));
      strongAskCapabilityWire(grant);
      if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now()) throw new Error();
    } catch {
      throw new PriceToolFailure();
    }
    const deadline = new AbortController();
    const combined = AbortSignal.any([signal, deadline.signal]);
    const timer = setTimeout(
      () => deadline.abort(),
      Math.min(2_147_483_647, deadlineAt - Date.now()),
    );
    let abort: (() => void) | undefined;
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new PriceToolFailure());
      combined.addEventListener('abort', abort, { once: true });
    });
    const attempt = async (): Promise<PriceToolReceipt> => {
      const response = await this.transport(
        `${this.#origin}/api/v1/ask/runs/${request.runId}/tools/price-per-square-meter`,
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
      if (
        response.status !== 200 ||
        !response.body ||
        !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') ||
        Number(response.headers.get('content-length') ?? 0) > 16384
      ) {
        void response.body?.cancel().catch(() => {});
        throw new PriceToolFailure();
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
          if (size > 16384) throw new Error();
          chunks.push(chunk.value);
        }
        const receipt = parsePriceToolReceipt(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        if (
          !sameAskIdentity(receipt, request) ||
          receipt.executionId !== request.executionId ||
          !sameAskInputs(receipt.inputs, request.inputs) ||
          receipt.operation !== request.operation
        )
          throw new PriceToolFailure();
        return structuredClone(receipt);
      } finally {
        combined.removeEventListener('abort', cancel);
        cancel();
      }
    };
    try {
      return await Promise.race([attempt(), stopped]);
    } catch {
      throw new PriceToolFailure();
    } finally {
      clearTimeout(timer);
      if (abort) combined.removeEventListener('abort', abort);
      deadline.abort();
    }
  }
}
