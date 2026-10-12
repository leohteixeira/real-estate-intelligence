import type { CheckpointRecord, CheckpointResponse } from '@rei/contracts';
import type { GraphCheckpointTransport } from './graph-checkpoint.port';
import { GraphCheckpointFailure } from './graph-checkpoint.port';

/** Test-only remote boundary: records still cross the same serialized contract. */
export function checkpointFixture(): GraphCheckpointTransport & {
  records: Map<string, CheckpointRecord>;
} {
  const records = new Map<string, CheckpointRecord>();
  return {
    records,
    async execute(request): Promise<CheckpointResponse> {
      const prefix = `${request.runId}:${request.namespace}:`;
      if (request.operation === 'get') {
        const scoped = [...records.entries()].filter(([key]) => key.startsWith(prefix));
        return {
          operation: 'get',
          record: structuredClone(
            request.checkpointId
              ? (records.get(prefix + request.checkpointId) ?? null)
              : (scoped.at(-1)?.[1] ?? null),
          ),
        };
      }
      if (request.operation === 'list') {
        const scoped = [...records.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([, record]) => record)
          .reverse();
        const before = request.beforeId
          ? scoped.findIndex((record) => record.checkpointId === request.beforeId) + 1
          : 0;
        return {
          operation: 'list',
          records: structuredClone(scoped.slice(before, before + request.limit)),
        };
      }
      if (request.operation === 'put') {
        const existing = records.get(prefix + request.checkpointId);
        if (existing) {
          if (
            existing.parentId !== request.parentId ||
            existing.checkpoint.type !== request.checkpoint.type ||
            existing.checkpoint.base64 !== request.checkpoint.base64 ||
            existing.metadata.type !== request.metadata.type ||
            existing.metadata.base64 !== request.metadata.base64
          )
            throw new GraphCheckpointFailure('rejected', 'http-conflict', 'put');
          return { operation: 'put', saved: true };
        }
        const head = [...records.entries()].filter(([key]) => key.startsWith(prefix)).at(-1)?.[1];
        if (
          (head?.checkpointId ?? null) !== request.parentId ||
          request.checkpointId === request.parentId
        )
          throw new GraphCheckpointFailure('rejected', 'http-conflict', 'put');
        records.set(
          prefix + request.checkpointId,
          structuredClone({
            checkpointId: request.checkpointId,
            parentId: request.parentId,
            checkpoint: request.checkpoint,
            metadata: request.metadata,
            pendingWrites: [],
          }),
        );
      } else {
        const record = records.get(prefix + request.checkpointId);
        if (!record) throw new Error('Missing test checkpoint.');
        const pending = [...record.pendingWrites];
        for (const write of request.writes) {
          const index = pending.findIndex(
            (item) => item.taskId === request.taskId && item.index === write.index,
          );
          const value = structuredClone({ taskId: request.taskId, ...write });
          if (index < 0) pending.push(value);
          else pending[index] = value;
        }
        records.set(prefix + request.checkpointId, { ...record, pendingWrites: pending });
      }
      return { operation: request.operation, saved: true };
    },
  };
}
