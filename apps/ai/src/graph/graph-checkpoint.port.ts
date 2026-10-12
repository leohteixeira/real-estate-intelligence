import type { CheckpointRequest, CheckpointResponse } from '@rei/contracts';
export interface GraphCheckpointTransport {
  execute(
    request: CheckpointRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<CheckpointResponse>;
}
export class GraphCheckpointFailure extends Error {
  public constructor(
    public readonly kind: 'transient' | 'rejected' | 'cancelled' = 'transient',
    public readonly source:
      | 'saver'
      | 'http-status'
      | 'http-invalid'
      | 'http-forbidden'
      | 'http-conflict'
      | 'http-envelope'
      | 'canonical-schema'
      | 'canonical-values' = 'saver',
    public readonly operation?: CheckpointRequest['operation'],
  ) {
    super('Checkpoint operation unavailable.');
  }
}
