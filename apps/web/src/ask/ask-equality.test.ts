import { expect, it } from 'vitest';
import { parseAskRun } from '@rei/contracts';
import { sameAskRun } from './ask-equality';
import { completed, prior, queued, reorderMembers, running } from './ask-fixtures.test';

it.each([queued, running, completed, prior])(
  'matches separately serialized valid $state records with reordered nested fields',
  (run) => {
    expect(sameAskRun(parseAskRun(reorderMembers(run)), parseAskRun(run))).toBe(true);
  },
);
it('rejects absent history and real independently valid changes to returned facts', () => {
  expect(sameAskRun(undefined, queued)).toBe(false);
  if (completed.result?.kind !== 'price_per_square_meter')
    throw new Error('Price fixture required');
  const inputs = { ...completed.result.inputs, areaSquareMeters: 80.125 };
  for (const changed of [
    { ...completed, question: 'A different recorded question' },
    { ...completed, metadata: { ...completed.metadata, asOf: '2026-10-11T12:00:11.000Z' } },
    { ...completed, result: { ...completed.result, minorUnits: 1000001 } },
    { ...completed, originalInputs: inputs, result: { ...completed.result, inputs } },
    {
      ...completed,
      result: { ...completed.result, computedAt: completed.createdAt },
      decision: { ...completed.decision!, decidedAt: completed.createdAt },
      steps: completed.steps.map((step) => ({
        ...step,
        at: step.phase === 'completed' ? step.at : completed.createdAt,
      })),
    },
    {
      ...completed,
      steps: completed.steps.slice(1).map((step, index) => ({ ...step, sequence: index + 1 })),
    },
  ])
    expect(sameAskRun(parseAskRun(reorderMembers(changed)), completed)).toBe(false);
  expect(sameAskRun(parseAskRun(prior), parseAskRun(reorderMembers(prior)))).toBe(true);
  expect(sameAskRun(parseAskRun(running), completed)).toBe(false);
});
