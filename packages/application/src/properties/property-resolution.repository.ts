import type {
  ResolutionConfiguration,
  ResolutionInput,
  ResolutionComparison,
  ResolutionGroup,
} from '@rei/domain';
import type { Transaction } from '../shared/index.js';
export interface PropertyResolutionRepository {
  /** Holds the same short transaction guard as chronology/creation writers, then reads all members. */
  load(transaction: Transaction, maximumListings: number): Promise<readonly ResolutionInput[]>;
  save(
    transaction: Transaction,
    input: {
      readonly inputs: readonly ResolutionInput[];
      readonly comparisons: readonly ResolutionComparison[];
      readonly groups: readonly ResolutionGroup[];
      readonly configuration: ResolutionConfiguration;
    },
    signal: AbortSignal,
  ): Promise<number>;
}
export const PROPERTY_RESOLUTION_REPOSITORY = Symbol.for('rei.PropertyResolutionRepository');
