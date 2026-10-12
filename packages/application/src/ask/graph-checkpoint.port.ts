import type { CheckpointRequest, CheckpointResponse } from '@rei/domain';
export const GRAPH_CHECKPOINT_PORT = Symbol('GRAPH_CHECKPOINT_PORT');
export interface GraphCheckpointPort {
  execute(
    request: CheckpointRequest,
    grant: string,
    signal: AbortSignal,
  ): Promise<CheckpointResponse>;
  prune(limit: number, signal: AbortSignal): Promise<number>;
}
