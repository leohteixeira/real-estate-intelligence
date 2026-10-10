export {
  activeAmqpTraceHeaders,
  amqpTraceHeaders,
  assertTraceContextConsistency,
  extractAmqpTraceContext,
  runCollectionOperationSpan,
  runScheduledCollectionSpan,
  runOutboxAppendSpan,
  runOutboxPublishSpan,
  startMessagingConsumeSpan,
} from './trace-context.js';
export type { AmqpHeaders, AmqpTraceHeaders, TracedConsumerOperation } from './trace-context.js';
export type { ScheduledCollectionSpanResult } from './trace-context.js';
