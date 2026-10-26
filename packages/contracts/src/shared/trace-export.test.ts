import { describe, expect, it } from 'vitest';
import { privateTraceAttributes, privateTraceName } from './trace-export.js';
describe('closed private trace vocabulary', () => {
  it('keeps bounded identities, categorical work and measurements and removes arbitrary automatic fields', () => {
    const safe = {
      'rei.ask.run_id': '0199c8f2-2394-7ba0-8f9e-286378779210',
      'rei.ai.model': 'typesafe-ai/jev',
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
    expect(privateTraceName('ask.graph.confidenceGate')).toBe('ask.graph.confidenceGate');
    expect(privateTraceName('GET /private?secret')).toBe('http.request');
    expect(privateTraceName('select private sql')).toBe('operation');
  });
});
