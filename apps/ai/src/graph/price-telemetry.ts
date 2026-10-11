import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import type { PriceExecutionRequest } from '@rei/contracts';
export function priceTraceHeaders(): Readonly<Record<string, string>> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return Object.fromEntries(
    Object.entries(carrier).filter(([key]) => key === 'traceparent' || key === 'tracestate'),
  );
}
/** No questions, inputs, tool grants, error text or model payloads enter telemetry. */
export async function priceNodeSpan<T>(
  node: 'fixedDecision' | 'validatedInputs' | 'priceTool',
  input: PriceExecutionRequest,
  work: () => Promise<T>,
): Promise<T> {
  return trace.getTracer('rei.ai.structured-price').startActiveSpan(
    `ask.graph.${node}`,
    {
      attributes: {
        'rei.ask.event_id': input.eventId,
        'rei.ask.run_id': input.runId,
        'rei.ask.graph_node': node,
        ...(node === 'priceTool' ? { 'rei.ask.tool': 'price-per-square-meter' } : {}),
      },
    },
    async (span) => {
      try {
        const result = await work();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
