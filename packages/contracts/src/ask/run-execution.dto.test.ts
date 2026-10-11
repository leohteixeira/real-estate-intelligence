import { describe, expect, it } from 'vitest';
import { parseRunExecutionRequest, parseRunExecutionEvidence } from './run-execution.dto.js';

const input = {
  version: 1,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation',
  query: 'A private synthetic question',
  locale: 'en',
};
const evidence = {
  version: 1,
  runId: input.runId,
  threadId: input.threadId,
  step: 'foundation',
  outcome: 'foundation-executed',
  visitedNodes: ['noOp'],
};
describe('foundation execution wire boundary', () => {
  it('admits only bounded v1 inputs and correlated no-op evidence', () => {
    expect(parseRunExecutionRequest(input)).toEqual(input);
    expect(parseRunExecutionEvidence(evidence)).toEqual(evidence);
    expect(
      parseRunExecutionRequest({ ...input, query: 'x'.repeat(16000), locale: 'pt-BR' }).locale,
    ).toBe('pt-BR');
  });
  it.each([
    { ...input, version: 2 },
    { ...input, step: 'price' },
    { ...input, query: ' ' },
    { ...input, query: 'x'.repeat(16001) },
    { ...input, runId: input.runId.toUpperCase() },
    { ...input, threadId: 'not-a-uuid' },
    { ...input, runId: `${input.runId}\n` },
    { ...input, threadId: `${input.threadId}\r` },
    { ...input, locale: 'fr' },
    { ...input, token: 'private' },
    { ...input, locale: undefined },
    null,
    [],
  ])('refuses malformed input without reflection', (value) => {
    expect(() => parseRunExecutionRequest(value)).toThrow('Invalid contract value.');
  });
  it.each([
    { ...evidence, visitedNodes: [] },
    { ...evidence, visitedNodes: ['noOp', 'noOp'] },
    { ...evidence, visitedNodes: ['model'] },
    { ...evidence, query: input.query },
    { ...evidence, outcome: 'completed' },
    { ...evidence, version: 2 },
    { ...evidence, runId: `${input.runId}\n` },
    { ...evidence, threadId: `${input.threadId}\r\n` },
  ])('refuses manufactured or public result shapes', (value) => {
    expect(() => parseRunExecutionEvidence(value)).toThrow('Invalid contract value.');
  });
});
