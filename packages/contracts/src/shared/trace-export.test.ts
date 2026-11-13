import { describe, expect, it } from 'vitest';
import { privateTraceAttributes, privateTraceName } from './trace-export.js';
describe('closed private trace vocabulary', () => {
  it('keeps bounded identities, categorical work and measurements and removes arbitrary automatic fields', () => {
    const safe = {
      'rei.ask.run_id': '0199c8f2-2394-7ba0-8f9e-286378779210',
      'rei.ai.model': 'claude-haiku-5-5',
      'rei.ai.provider': 'anthropic',
      'rei.ai.attempt.purpose': 'decision',
      'rei.ask.decision_source': 'claude-haiku-v1',
      'rei.ai.cost': 'unavailable',
      'rei.ask.queue_duration_ms': 2,
      'rei.ask.degraded': false,
      'rei.collection.replayed': true,
      'rei.collection.observed_count': 4,
      'rei.collection.parsed_count': 3,
      'rei.collection.changed_count': 2,
      'rei.collection.failed_count': 1,
    };
    expect(
      privateTraceAttributes({
        ...safe,
        'db.statement': 'private SQL',
        'http.url': 'https://secret?q=private',
        'rei.ask.query': 'private prompt',
        'rei.ai.response': 'private response',
        'rei.ai.route': 'private route',
        'rei.ask.confidence': NaN,
      }),
    ).toEqual(safe);
    // Removed provider vocabulary (ADR 0029) is no longer exportable.
    expect(
      privateTraceAttributes({
        'rei.ai.model': 'typesafe-ai/jev',
        'rei.ai.provider': 'vercel-ai-gateway',
        'rei.ai.route': 'vercel-ai-gateway',
        'rei.ai.attempt.purpose': 'privacy-probe',
        'rei.ai.cost_usd': 0.001,
        'rei.ai.privacy.evidence_age_ms': 12,
        'resilience.policy.name': 'model-explanation.eligible-fallback',
      }),
    ).toEqual({});
    expect(
      privateTraceAttributes({
        'rei.ai.route': 'anthropic-direct',
        'rei.ask.decision_source': 'gateway-jev-v1',
        'resilience.policy.name': 'model-explanation.circuit-breaker',
      }),
    ).toEqual({
      'rei.ai.route': 'anthropic-direct',
      'rei.ask.decision_source': 'gateway-jev-v1',
      'resilience.policy.name': 'model-explanation.circuit-breaker',
    });
    expect(privateTraceName('ask.graph.confidenceGate')).toBe('ask.graph.confidenceGate');
    expect(privateTraceName('GET /private?secret')).toBe('http.request');
    expect(privateTraceName('select private sql')).toBe('operation');
  });
});
