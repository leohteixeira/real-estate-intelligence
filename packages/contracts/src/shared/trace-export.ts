/** Closed export vocabulary. Automatic HTTP/SQL errors and arbitrary SDK metadata are excluded. */
const identifiers = new Set(['rei.ask.event_id', 'rei.ask.run_id', 'rei.ask.thread_id']);
const numbers = new Set([
  'http.status_code',
  'http.response.status_code',
  'rei.ask.queue_duration_ms',
  'rei.ask.total_duration_ms',
  'rei.ask.duration_ms',
  'rei.ask.confidence',
  'rei.ai.output_tokens',
  'rei.ai.input_tokens',
  'rei.ai.duration_ms',
  'rei.ai.cost_usd',
  'rei.ai.privacy.evidence_age_ms',
  'rei.collection.observed_count',
  'rei.collection.parsed_count',
  'rei.collection.changed_count',
  'rei.collection.failed_count',
]);
const vocabulary: Readonly<Record<string, readonly string[]>> = {
  'rei.operation.result': ['succeeded', 'failed', 'cancelled', 'timed-out'],
  'rei.ask.graph_node': [
    'fixedDecision',
    'validatedInputs',
    'typedDecision',
    'confidenceGate',
    'executeIntent',
    'priceTool',
    'modelExplanation',
  ],
  'rei.ask.tool': ['price-per-square-meter'],
  'rei.ask.intent': [
    'price_per_square_meter',
    'listing_search',
    'property_history',
    'region_statistics',
    'comparables',
    'unsupported',
  ],
  'rei.ask.decision_source': ['gateway-jev-v1', 'heuristic-v1'],
  'rei.ask.outcome': [
    'completed',
    'failed',
    'awaiting-confirmation',
    'execution-unavailable',
    'price-calculated',
    'succeeded',
    'cancelled',
    'reused',
  ],
  'rei.ask.transition.from': [
    'typedDecision',
    'confidenceGate',
    'executeIntent',
    'modelExplanation',
  ],
  'rei.ask.transition.to': [
    'confidenceGate',
    'executeIntent',
    'modelExplanation',
    'end',
    'confirmation-required',
  ],
  'resilience.policy.name': [
    'intent.local-degradation',
    'intent.bulkhead',
    'intent.circuit-breaker',
    'intent.transient-retry',
    'intent.rate-limit',
    'intent.attempt-timeout',
    'checkpoint.fail-closed',
    'checkpoint.bulkhead',
    'checkpoint.circuit-breaker',
    'checkpoint.transient-retry',
    'checkpoint.rate-limit',
    'checkpoint.attempt-timeout',
    'price-tool.fail-closed',
    'price-tool.bulkhead',
    'price-tool.circuit-breaker',
    'price-tool.transient-retry',
    'price-tool.rate-limit',
    'price-tool.attempt-timeout',
    ...[
      'eligible-fallback',
      'bulkhead',
      'circuit-breaker',
      'transient-retry',
      'rate-limit',
      'attempt-timeout',
    ].map((policy) => `model-explanation.${policy}`),
    ...['anthropic/claude-haiku-5.5', 'deepseek/deepseek-v4-flash-0731'].map(
      (model) => `model-explanation.circuit-breaker.vercel-ai-gateway.${model}`,
    ),
  ],
  'rei.ask.checkpoint_operation': ['get', 'list', 'put', 'put-writes'],
  'rei.ai.model': [
    'typesafe-ai/jev',
    'anthropic/claude-haiku-5.5',
    'deepseek/deepseek-v4-flash-0731',
    'unapproved',
  ],
  'rei.ai.provider': ['vercel-ai-gateway'],
  'rei.ai.route': ['vercel-ai-gateway'],
  'rei.ai.attempt.purpose': ['privacy-probe', 'decision', 'explanation'],
  'rei.ai.failure.kind': [
    'policy',
    'rejected',
    'authentication',
    'budget',
    'cancelled',
    'exhausted',
    'transient',
  ],
  'rei.ai.usage': ['available', 'unavailable'],
  'rei.ai.cost': ['available', 'unavailable'],
  'dependency.name': ['model-explanation', 'intent-decision', 'intent', 'checkpoint', 'price-tool'],
  'resilience.event.type': [
    'retry',
    'timeout',
    'circuit-open',
    'circuit-half-open',
    'circuit-closed',
    'circuit-rejected',
    'bulkhead-rejected',
    'rate-limited',
    'fallback',
  ],
  'http.method': ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
  'http.request.method': ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
};
export function privateTraceAttributes(attributes: Readonly<Record<string, unknown>>) {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (identifiers.has(key) && typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value))
      safe[key] = value;
    else if (numbers.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0)
      safe[key] = value;
    else if (
      (key === 'rei.ask.degraded' ||
        key === 'rei.ask.confirmed' ||
        key === 'rei.collection.replayed') &&
      typeof value === 'boolean'
    )
      safe[key] = value;
    else if (typeof value === 'string' && vocabulary[key]?.includes(value)) safe[key] = value;
  }
  return safe;
}
const names = new Set([
  'outbox.append',
  'outbox.publish',
  'messaging.consume',
  'collection.run',
  'collection.scheduled-run',
  'ask.run',
  'ask.decision',
  'ask.decision.attempt',
  'ask.model.attempt',
  'ask.tool',
  'ask.checkpoint',
  ...vocabulary['rei.ask.graph_node']!.map((node) => `ask.graph.${node}`),
]);
export function privateTraceName(name: string): string {
  return names.has(name)
    ? name
    : /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)(?:\s|$)/.test(name)
      ? 'http.request'
      : 'operation';
}
