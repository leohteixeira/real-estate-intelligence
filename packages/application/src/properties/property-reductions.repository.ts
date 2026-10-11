import type { ReductionCandidate } from '@rei/domain';

/** A single coherent owned-schema read, projected without raw/text/correction payloads. */
export interface PropertyReductionsRepository {
  readCandidates(placeIds: readonly string[]): Promise<readonly ReductionCandidate[]>;
}
