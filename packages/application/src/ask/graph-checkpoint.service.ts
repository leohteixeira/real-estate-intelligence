import type { GraphCheckpointPort } from './graph-checkpoint.port.js';
import { AskLiveError } from './ask-run.repository.js';
/** API-owned facade; malformed or missing authority fails before entering persistence. */
export class GraphCheckpointService implements GraphCheckpointPort {
  public constructor(private readonly repository: GraphCheckpointPort) {}
  public readonly execute: GraphCheckpointPort['execute'] = async (request, grant, signal) => {
    signal.throwIfAborted();
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(grant)) throw new AskLiveError('forbidden');
    return this.repository.execute(request, grant, signal);
  };
  public async prune(limit: number, signal: AbortSignal): Promise<number> {
    signal.throwIfAborted();
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new AskLiveError('invalid');
    return this.repository.prune(limit, signal);
  }
}
