import type {
  ResolutionInput,
  ResolutionGroup,
  ResolutionComparison,
  ResolutionConfiguration,
} from '@rei/domain';
import type { Transaction } from '../shared/index.js';
import type { PropertyResolutionRepository } from './property-resolution.repository.js';
/** Framework-neutral fake: a caller-owned transaction runner snapshots these values for rollback. */
export class InMemoryPropertyResolutionRepository implements PropertyResolutionRepository {
  public inputs: readonly ResolutionInput[] = [];
  public groups: readonly ResolutionGroup[] = [];
  public comparisons: readonly ResolutionComparison[] = [];
  public configuration: ResolutionConfiguration | null = null;
  public failure: Error | null = null;
  public async load(
    _transaction: Transaction,
    maximumListings: number,
  ): Promise<readonly ResolutionInput[]> {
    if (this.inputs.length > maximumListings)
      throw new RangeError('Resolution listing bound exceeded.');
    return this.inputs;
  }
  public async save(
    _transaction: Transaction,
    input: {
      readonly inputs: readonly ResolutionInput[];
      readonly groups: readonly ResolutionGroup[];
      readonly comparisons: readonly ResolutionComparison[];
      readonly configuration: ResolutionConfiguration;
    },
    signal: AbortSignal,
  ): Promise<number> {
    signal.throwIfAborted();
    if (this.failure) throw this.failure;
    const previous = JSON.stringify([this.groups, this.comparisons, this.configuration]);
    this.groups = input.groups;
    this.comparisons = input.comparisons;
    this.configuration = input.configuration;
    return previous === JSON.stringify([this.groups, this.comparisons, this.configuration]) ? 0 : 1;
  }
}
