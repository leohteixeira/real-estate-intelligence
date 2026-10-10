import type { EnabledSourceView, SourceRegistration } from '@rei/domain';

export const SOURCE_REGISTER_REPOSITORY = Symbol.for('rei.SourceRegisterRepository');

export interface SourceRegisterRepository {
  findById(sourceId: string, signal?: AbortSignal): Promise<SourceRegistration | null>;
  enableAtomically(
    sourceId: string,
    enabledAt: string,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null>;
  listEnabled(signal?: AbortSignal): Promise<readonly EnabledSourceView[]>;
}
