/** SDK-independent storage protocol. Execution authority belongs only in HTTP Bearer. */
export interface CheckpointBytes {
  readonly type: 'json' | 'bytes';
  readonly base64: string;
}
export interface CheckpointAddress {
  readonly version: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly threadId: string;
  readonly executionId: string;
  readonly graphVersion: 'price-v1';
  readonly namespace: string;
}
export interface CheckpointWrite {
  readonly index: number;
  readonly channel: string;
  readonly value: CheckpointBytes;
}
export type CheckpointOperation =
  | { readonly operation: 'get'; readonly checkpointId: string | null }
  | { readonly operation: 'list'; readonly beforeId: string | null; readonly limit: number }
  | {
      readonly operation: 'put';
      readonly checkpointId: string;
      readonly parentId: string | null;
      readonly checkpoint: CheckpointBytes;
      readonly metadata: CheckpointBytes;
    }
  | {
      readonly operation: 'put-writes';
      readonly checkpointId: string;
      readonly taskId: string;
      readonly writes: readonly CheckpointWrite[];
    };
export type CheckpointRequest = CheckpointAddress & CheckpointOperation;
export interface CheckpointRecord {
  readonly checkpointId: string;
  readonly parentId: string | null;
  readonly checkpoint: CheckpointBytes;
  readonly metadata: CheckpointBytes;
  readonly pendingWrites: readonly (CheckpointWrite & { readonly taskId: string })[];
}
export type CheckpointResponse =
  | { readonly operation: 'get'; readonly record: CheckpointRecord | null }
  | { readonly operation: 'list'; readonly records: readonly CheckpointRecord[] }
  | { readonly operation: 'put' | 'put-writes'; readonly saved: true };
