import { isGraphInterrupt } from '@langchain/langgraph';
import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import type { AskRequestedIdentity } from '@rei/contracts';
export function priceTraceHeaders(): Readonly<Record<string, string>> {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return Object.fromEntries(
    Object.entries(carrier).filter(([key]) => key === 'traceparent' || key === 'tracestate'),
  );
}
/** No questions, inputs, tool grants, error text or model payloads enter telemetry. */
export async function priceNodeSpan<T>(
  node:
    | 'run'
    | 'tool'
    | 'checkpoint'
    | 'decision'
    | 'fixedDecision'
    | 'validatedInputs'
    | 'priceTool'
    | 'modelExplanation'
    | 'typedDecision'
    | 'executeIntent'
    | 'confidenceGate',
  input: AskRequestedIdentity,
  work: () => Promise<T>,
): Promise<T> {
  return trace.getTracer('rei.ai.structured-price').startActiveSpan(
    ['run', 'tool', 'checkpoint', 'decision'].includes(node) ? `ask.${node}` : `ask.graph.${node}`,
    {
      attributes: {
        'rei.ask.event_id': input.eventId,
        'rei.ask.run_id': input.runId,
        'rei.ask.thread_id': input.threadId,
        'rei.ask.graph_node': node,
        ...(['priceTool', 'tool'].includes(node)
          ? { 'rei.ask.tool': 'price-per-square-meter' }
          : {}),
      },
    },
    async (span) => {
      try {
        const result = await work();
        span.setAttribute('rei.operation.result', 'succeeded');
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: isGraphInterrupt(error) ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
