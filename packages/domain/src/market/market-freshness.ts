import { DomainValidationError, parseRfc3339Timestamp } from '../shared/index.js';
import type { MarketEvidence } from './market.read.types.js';

export interface MarketSourceCompletion {
  readonly sourceId: string;
  readonly completedAt: string;
}

/** D-098: completion belongs to a source; freshness belongs to each figure's contributors. */
export function marketFreshness<T extends MarketEvidence>(
  figure: T,
  completions: readonly MarketSourceCompletion[],
  evaluatedAt: string,
  computedAt = figure.computedAt,
): T {
  const evaluated = Date.parse(parseRfc3339Timestamp(evaluatedAt, 'evaluatedAt'));
  const computed = Date.parse(parseRfc3339Timestamp(computedAt, 'computedAt'));
  if (computed > evaluated)
    throw new DomainValidationError('Computation follows evaluation.', 'computedAt');
  const times = new Map<string, number>();
  for (const completion of completions) {
    const time = Date.parse(parseRfc3339Timestamp(completion.completedAt, 'completedAt'));
    if (time > evaluated)
      throw new DomainValidationError('Completion follows evaluation.', 'completedAt');
    times.set(completion.sourceId, Math.max(times.get(completion.sourceId) ?? time, time));
  }
  for (const source of figure.sources) {
    if (Date.parse(parseRfc3339Timestamp(source.collectedAt, 'collectedAt')) > evaluated)
      throw new DomainValidationError('Observation follows evaluation.', 'collectedAt');
  }
  const tracked =
    figure.sources.length > 0 && figure.sources.every((source) => times.has(source.id));
  const latest = tracked
    ? Math.max(...figure.sources.map((source) => times.get(source.id)!))
    : null;
  return {
    ...figure,
    sources: figure.sources.map((source) => ({ ...source })),
    computedAt,
    freshness: {
      status: latest === null ? 'untracked' : computed < latest ? 'stale' : 'fresh',
      latestCollectionCompletedAt: latest === null ? null : new Date(latest).toISOString(),
      ageSeconds: (evaluated - computed) / 1000,
    },
  };
}
