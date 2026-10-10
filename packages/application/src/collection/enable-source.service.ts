import {
  decideSourceEnablement,
  type SourceEnableRefusalCode,
  type SourceRegistration,
} from '@rei/domain';

import type { Clock } from '../shared/index.js';
import type { SourceRegisterRepository } from './source-register.repository.js';

export type EnableSourceResult =
  | { readonly status: 'enabled'; readonly source: SourceRegistration }
  | { readonly status: 'already-enabled'; readonly source: SourceRegistration }
  | { readonly status: 'not-found'; readonly sourceId: string }
  | {
      readonly status: 'refused';
      readonly sourceId: string;
      readonly reason: SourceEnableRefusalCode;
    };

const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateSourceId(sourceId: string): string {
  if (!SOURCE_ID.test(sourceId) || sourceId.length > 100) {
    throw new TypeError('source ID must be a lower-kebab identifier of at most 100 characters');
  }
  return sourceId;
}

/** Enables one reviewed source without accepting any caller-supplied policy override. */
export class EnableSource {
  public constructor(
    private readonly sources: SourceRegisterRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(sourceIdInput: string, signal: AbortSignal): Promise<EnableSourceResult> {
    const sourceId = validateSourceId(sourceIdInput);
    signal.throwIfAborted();
    const current = await this.sources.findById(sourceId, signal);
    if (current === null) return Object.freeze({ status: 'not-found', sourceId });

    const decision = decideSourceEnablement(current);
    if (!decision.eligible) {
      return Object.freeze({ status: 'refused', sourceId, reason: decision.code });
    }
    if (current.enabled) return Object.freeze({ status: 'already-enabled', source: current });

    signal.throwIfAborted();
    const enabled = await this.sources.enableAtomically(sourceId, this.clock.now(), signal);
    if (enabled?.enabled) return Object.freeze({ status: 'enabled', source: enabled });

    signal.throwIfAborted();
    const latest = await this.sources.findById(sourceId, signal);
    if (latest?.enabled) return Object.freeze({ status: 'already-enabled', source: latest });
    if (latest === null) return Object.freeze({ status: 'not-found', sourceId });
    const latestDecision = decideSourceEnablement(latest);
    if (latestDecision.eligible) {
      throw new Error('Source register transition failed.');
    }
    return Object.freeze({
      status: 'refused',
      sourceId,
      reason: latestDecision.code,
    });
  }
}
