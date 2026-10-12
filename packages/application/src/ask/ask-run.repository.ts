import type {
  AskClaim,
  AskCompletion,
  AskLiveEvent,
  AskLiveRun,
  AskLiveThread,
  AskRequestedIdentity,
  PriceResult,
  PriceToolReceipt,
  PriceToolRequest,
  ValidatedAskCreate,
} from '@rei/domain';
export const ASK_RUN_REPOSITORY = Symbol('ASK_RUN_REPOSITORY');
export class AskLiveError extends Error {
  public constructor(
    public readonly kind:
      | 'forbidden'
      | 'conflict'
      | 'busy'
      | 'capacity'
      | 'invalid'
      | 'unavailable',
  ) {
    super('Ask operation unavailable.');
  }
}
export interface AskRunRepository {
  expireQueued(limit: number, signal?: AbortSignal): Promise<number>;
  create(
    request: ValidatedAskCreate,
    capability: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<AskLiveRun>;
  run(id: string, capability: string, signal?: AbortSignal): Promise<AskLiveRun | null>;
  thread(id: string, capability: string, signal?: AbortSignal): Promise<AskLiveThread | null>;
  events(
    id: string,
    capability: string,
    after: number,
    signal?: AbortSignal,
  ): Promise<readonly AskLiveEvent[]>;
  claim(identity: AskRequestedIdentity, signal?: AbortSignal): Promise<AskClaim>;
  tool(
    request: PriceToolRequest,
    grant: string,
    calculate: (at: string) => PriceResult,
    signal?: AbortSignal,
  ): Promise<PriceToolReceipt>;
  complete(request: AskCompletion, signal?: AbortSignal): Promise<AskLiveRun>;
}
