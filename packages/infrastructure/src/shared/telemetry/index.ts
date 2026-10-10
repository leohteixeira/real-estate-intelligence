export {
  activeAmqpTraceHeaders,
  amqpTraceHeaders,
  assertTraceContextConsistency,
  extractAmqpTraceContext,
  runCollectionOperationSpan,
  runOutboxAppendSpan,
  runOutboxPublishSpan,
  startMessagingConsumeSpan,
} from './trace-context.js';
export type { AmqpHeaders, AmqpTraceHeaders, TracedConsumerOperation } from './trace-context.js';
