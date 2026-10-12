import { AskLiveError, type GraphCheckpointPort, type TransactionRunner } from '@rei/application';
import {
  parseCheckpointRequest,
  parseCheckpointResponse,
  parseCheckpointRecord,
  type CheckpointRecord,
  type CheckpointRequest,
  type CheckpointResponse,
} from '@rei/contracts';
import type {
  DatabaseClient,
  DatabaseConnection,
} from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { askDigest } from './ask-authority.js';
import { authorizeAskExecution, lockAskThread } from './ask-execution.authorization.js';

interface StoredCheckpoint {
  checkpoint_id: string;
  parent_id: string | null;
  sequence: string;
  checkpoint_type: 'json' | 'bytes';
  checkpoint_bytes: Buffer;
  metadata_type: 'json' | 'bytes';
  metadata_bytes: Buffer;
  content_digest: string;
}
const columns =
  'checkpoint_id::text,parent_id::text,sequence::text,checkpoint_type,checkpoint_bytes,metadata_type,metadata_bytes,content_digest';
// The wire sequence is text; ORDER BY must qualify the underlying bigint, not this output alias.
const scope = (request: CheckpointRequest): readonly string[] => [
  request.runId,
  request.graphVersion,
  request.namespace,
];
const checkpointDigest = (request: Extract<CheckpointRequest, { operation: 'put' }>) =>
  askDigest(
    JSON.stringify([
      request.parentId,
      request.checkpoint.type,
      request.checkpoint.base64,
      request.metadata.type,
      request.metadata.base64,
    ]),
  );

/** API-only SQL. Every operation authorizes under the same thread lock as claim replacement. */
export class PostgresGraphCheckpointRepository implements GraphCheckpointPort {
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly transactions: TransactionRunner,
  ) {}
  private async transaction<T>(
    signal: AbortSignal,
    work: (client: DatabaseClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactions.runInTransaction(
        (tx) => work(postgresClientFor(tx, this.connection)),
        signal,
      );
    } catch (error) {
      if (signal.aborted || error instanceof AskLiveError) throw error;
      throw new AskLiveError(error instanceof TypeError ? 'invalid' : 'unavailable');
    }
  }
  public async execute(
    untrusted: CheckpointRequest,
    grant: string,
    signal: AbortSignal,
  ): Promise<CheckpointResponse> {
    let request: CheckpointRequest;
    try {
      request = structuredClone(parseCheckpointRequest(untrusted));
    } catch {
      throw new AskLiveError('invalid');
    }
    return this.transaction(signal, async (client) => {
      await lockAskThread(client, request.threadId);
      await authorizeAskExecution(client, request, { scope: 'checkpoint', grant });
      const horizon = await client.query<{ expired: boolean }>(
        'SELECT (graph_pruned_at IS NOT NULL OR graph_expires_at<=clock_timestamp()) AS expired FROM ask.run WHERE id=$1',
        [request.runId],
      );
      if (horizon[0]?.expired) throw new AskLiveError('forbidden');
      switch (request.operation) {
        case 'get': {
          const rows = await client.query<StoredCheckpoint>(
            `SELECT ${columns} FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND ($4::uuid IS NULL OR checkpoint_id=$4) ORDER BY ask.graph_checkpoint.sequence DESC LIMIT 1`,
            [...scope(request), request.checkpointId],
          );
          if (request.checkpointId && !rows[0]) throw new AskLiveError('forbidden');
          return parseCheckpointResponse({
            operation: 'get',
            record: rows[0] ? await this.record(client, request, rows[0]) : null,
          });
        }
        case 'list': {
          let before: string | null = null;
          if (request.beforeId) {
            const rows = await client.query<{ sequence: string }>(
              'SELECT sequence::text FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND checkpoint_id=$4',
              [...scope(request), request.beforeId],
            );
            if (!rows[0]) throw new AskLiveError('forbidden');
            before = rows[0].sequence;
          }
          const rows = await client.query<StoredCheckpoint>(
            `SELECT ${columns} FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND ($4::bigint IS NULL OR sequence<$4) ORDER BY ask.graph_checkpoint.sequence DESC LIMIT $5`,
            [...scope(request), before, request.limit],
          );
          const records: CheckpointRecord[] = [];
          for (const row of rows) {
            const next = await this.record(client, request, row);
            if (
              Buffer.byteLength(
                JSON.stringify({ operation: 'list', records: [...records, next] }),
              ) > 8388608
            )
              break;
            records.push(next);
          }
          return parseCheckpointResponse({ operation: 'list', records });
        }
        case 'put': {
          const head = await client.query<StoredCheckpoint>(
            `SELECT ${columns} FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 ORDER BY ask.graph_checkpoint.sequence DESC LIMIT 1`,
            scope(request),
          );
          const existing = await client.query<{ content_digest: string }>(
            'SELECT content_digest FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND checkpoint_id=$4',
            [...scope(request), request.checkpointId],
          );
          const digest = checkpointDigest(request);
          if (existing[0]) {
            if (existing[0].content_digest !== digest) throw new AskLiveError('conflict');
            return { operation: 'put', saved: true };
          }
          if (
            (head[0]?.checkpoint_id ?? null) !== request.parentId ||
            request.checkpointId === request.parentId
          )
            throw new AskLiveError('conflict');
          await client.query(
            `WITH instant AS MATERIALIZED (SELECT clock_timestamp() AS at) UPDATE ask.run SET graph_started_at=COALESCE(graph_started_at,instant.at),graph_expires_at=COALESCE(graph_expires_at,instant.at+interval '30 days') FROM instant WHERE id=$1`,
            [request.runId],
          );
          await client.query(
            `INSERT INTO ask.graph_checkpoint(run_id,graph_version,namespace,checkpoint_id,parent_id,checkpoint_type,checkpoint_bytes,metadata_type,metadata_bytes,content_digest,expires_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,(SELECT graph_expires_at FROM ask.run WHERE id=$1))`,
            [
              ...scope(request),
              request.checkpointId,
              request.parentId,
              request.checkpoint.type,
              Buffer.from(request.checkpoint.base64, 'base64'),
              request.metadata.type,
              Buffer.from(request.metadata.base64, 'base64'),
              digest,
            ],
          );
          return { operation: 'put', saved: true };
        }
        case 'put-writes': {
          const rows = await client.query<{ id: string }>(
            'SELECT checkpoint_id::text AS id FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND checkpoint_id=$4',
            [...scope(request), request.checkpointId],
          );
          if (!rows[0]) throw new AskLiveError('forbidden');
          for (const write of request.writes) {
            const key = [...scope(request), request.checkpointId, request.taskId, write.index];
            const digest = askDigest(
              JSON.stringify([write.channel, write.value.type, write.value.base64]),
            );
            const previous = await client.query<{ content_digest: string }>(
              'SELECT content_digest FROM ask.graph_pending_write WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND checkpoint_id=$4 AND task_id=$5 AND write_index=$6',
              key,
            );
            if (previous[0] && write.index >= 0) {
              if (previous[0].content_digest !== digest) throw new AskLiveError('conflict');
              continue;
            }
            await client.query(
              `INSERT INTO ask.graph_pending_write(run_id,graph_version,namespace,checkpoint_id,task_id,write_index,channel,value_type,value_bytes,content_digest) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
              ON CONFLICT (run_id,graph_version,namespace,checkpoint_id,task_id,write_index) DO UPDATE SET channel=EXCLUDED.channel,value_type=EXCLUDED.value_type,value_bytes=EXCLUDED.value_bytes,content_digest=EXCLUDED.content_digest`,
              [
                ...key,
                write.channel,
                write.value.type,
                Buffer.from(write.value.base64, 'base64'),
                digest,
              ],
            );
          }
          const checkpoint = await client.query<StoredCheckpoint>(
            `SELECT ${columns} FROM ask.graph_checkpoint WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND checkpoint_id=$4`,
            [...scope(request), request.checkpointId],
          );
          parseCheckpointRecord(await this.record(client, request, checkpoint[0]!));
          return { operation: 'put-writes', saved: true };
        }
      }
    });
  }
  private async record(
    client: DatabaseClient,
    request: CheckpointRequest,
    row: StoredCheckpoint,
  ): Promise<CheckpointRecord> {
    const writes = await client.query<{
      task_id: string;
      write_index: number;
      channel: string;
      value_type: 'json' | 'bytes';
      value_bytes: Buffer;
    }>(
      'SELECT task_id,write_index,channel,value_type,value_bytes FROM ask.graph_pending_write WHERE run_id=$1 AND graph_version=$2 AND namespace=$3 AND checkpoint_id=$4 ORDER BY task_id,write_index',
      [...scope(request), row.checkpoint_id],
    );
    return parseCheckpointRecord({
      checkpointId: row.checkpoint_id,
      parentId: row.parent_id,
      checkpoint: { type: row.checkpoint_type, base64: row.checkpoint_bytes.toString('base64') },
      metadata: { type: row.metadata_type, base64: row.metadata_bytes.toString('base64') },
      pendingWrites: writes.map((write) => ({
        taskId: write.task_id,
        index: write.write_index,
        channel: write.channel,
        value: { type: write.value_type, base64: write.value_bytes.toString('base64') },
      })),
    });
  }
  public async prune(limit: number, signal: AbortSignal): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new AskLiveError('invalid');
    return this.transaction(signal, async (client) => {
      const candidates = await client.query<{ id: string; thread_id: string }>(
        `SELECT r.id::text,r.thread_id::text FROM ask.run r WHERE graph_started_at IS NOT NULL AND graph_pruned_at IS NULL AND
        (graph_expires_at<=clock_timestamp() OR (state IN ('completed','failed','expired') AND
          (SELECT count(*) FROM ask.run newer WHERE newer.thread_id=r.thread_id AND newer.state IN ('completed','failed','expired') AND (newer.document->>'updatedAt',newer.id)>(r.document->>'updatedAt',r.id))>=8)) ORDER BY r.id LIMIT $1`,
        [limit],
      );
      let pruned = 0;
      for (const candidate of candidates) {
        signal.throwIfAborted();
        await lockAskThread(client, candidate.thread_id);
        const eligible = await client.query<{ id: string }>(
          `UPDATE ask.run r SET graph_pruned_at=clock_timestamp() WHERE id=$1 AND graph_pruned_at IS NULL AND
          (graph_expires_at<=clock_timestamp() OR (state IN ('completed','failed','expired') AND
            (SELECT count(*) FROM ask.run newer WHERE newer.thread_id=r.thread_id AND newer.state IN ('completed','failed','expired') AND (newer.document->>'updatedAt',newer.id)>(r.document->>'updatedAt',r.id))>=8)) RETURNING id::text`,
          [candidate.id],
        );
        if (!eligible[0]) continue;
        await client.query('DELETE FROM ask.graph_checkpoint WHERE run_id=$1', [candidate.id]);
        pruned++;
      }
      return pruned;
    });
  }
}
