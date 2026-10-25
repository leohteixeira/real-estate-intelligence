import {
  compareResolutionInputs,
  INITIAL_RESOLUTION_CONFIGURATION,
  resolvePropertyGroups,
  validateResolutionConfiguration,
  type ResolutionConfiguration,
} from '@rei/domain';
import type { TransactionRunner } from '../shared/index.js';
import type { PropertyResolutionRepository } from './property-resolution.repository.js';
export class ReconcilePropertyResolution {
  public constructor(
    private readonly repository: PropertyResolutionRepository,
    private readonly transactions: TransactionRunner,
    private readonly configuration: ResolutionConfiguration = INITIAL_RESOLUTION_CONFIGURATION,
  ) {}
  public async execute(signal: AbortSignal): Promise<number> {
    validateResolutionConfiguration(this.configuration);
    return this.transactions.runInTransaction(async (transaction) => {
      signal.throwIfAborted();
      // The MVP bound refuses the whole scan; it never silently truncates a group or pair set.
      const inputs = await this.repository.load(transaction, 200);
      const comparisons = [];
      for (let left = 0; left < inputs.length; left++)
        for (let right = left + 1; right < inputs.length; right++) {
          signal.throwIfAborted();
          comparisons.push(
            compareResolutionInputs(inputs[left]!, inputs[right]!, this.configuration),
          );
        }
      return this.repository.save(
        transaction,
        {
          inputs,
          comparisons,
          groups: resolvePropertyGroups(inputs, comparisons),
          configuration: this.configuration,
        },
        signal,
      );
    }, signal);
  }
}
