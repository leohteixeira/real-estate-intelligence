import type { RunnableConfig } from '@langchain/core/runnables';
import {
  BaseCheckpointSaver,
  copyCheckpoint,
  WRITES_IDX_MAP,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from '@langchain/langgraph-checkpoint';
import {
  parseRunExecutionRequest,
  parseCheckpointRequest,
  parseCheckpointRecord,
  sameAskInputs,
  type CheckpointBytes,
  type CheckpointRecord,
  type CheckpointOperation,
  type PriceExecutionRequest,
} from '@rei/contracts';
import { z } from 'zod';
import { GraphCheckpointFailure, type GraphCheckpointTransport } from './graph-checkpoint.port';

export type DurablePriceInput = Omit<
  PriceExecutionRequest,
  'executionId' | 'toolGrant' | 'checkpointGrant'
>;
export function durablePriceInput(input: PriceExecutionRequest): DurablePriceInput {
  return {
    version: input.version,
    eventId: input.eventId,
    runId: input.runId,
    threadId: input.threadId,
    step: input.step,
    query: input.query,
    locale: input.locale,
    inputs: structuredClone(input.inputs),
  };
}
const version = z.union([z.number().finite(), z.string()]);
const checkpointSchema = z
  .object({
    v: z.literal(4),
    id: z.string(),
    ts: z.iso.datetime(),
    channel_values: z.record(z.string(), z.unknown()),
    channel_versions: z.record(z.string(), version),
    versions_seen: z.record(z.string(), z.record(z.string(), version)),
  })
  .strict();
const metadataSchema = z
  .object({
    source: z.enum(['input', 'loop']),
    step: z.number().int(),
    parents: z.record(z.string(), z.string()),
    counters_since_delta_snapshot: z
      .record(z.string(), z.tuple([z.number().int(), z.number().int()]))
      .optional(),
  })
  .strict();

/** Per-invocation closure: grants/configuration never enter checkpoint state or metadata. */
export class RemoteCheckpointSaver extends BaseCheckpointSaver {
  readonly #input: PriceExecutionRequest;
  readonly #checkpointPuts = new Map<string, Promise<RunnableConfig>>();
  readonly #activePuts = new Set<Promise<RunnableConfig>>();
  readonly #acknowledged = new Set<string>();
  readonly #putRegistrations = new Map<
    string,
    {
      promise: Promise<{ readonly work: Promise<RunnableConfig> }>;
      resolve: (value: { readonly work: Promise<RunnableConfig> }) => void;
      reject: (reason: unknown) => void;
    }
  >();
  public constructor(
    input: PriceExecutionRequest,
    private readonly adapter: GraphCheckpointTransport,
    private readonly signal: AbortSignal,
    private readonly deadlineAt: number,
  ) {
    super();
    const parsed = parseRunExecutionRequest(input);
    if (parsed.step === 'foundation') throw new GraphCheckpointFailure('rejected');
    this.#input = structuredClone(parsed);
  }
  private address(config: RunnableConfig) {
    const values = config.configurable;
    if (
      !values ||
      values.thread_id !== this.#input.threadId ||
      (values.runId !== undefined && values.runId !== this.#input.runId) ||
      (values.eventId !== undefined && values.eventId !== this.#input.eventId) ||
      (values.executionId !== undefined && values.executionId !== this.#input.executionId) ||
      (values.graphVersion !== undefined &&
        values.graphVersion !==
          (this.#input.step === 'routed-text-v1'
            ? 'intent-routing-v1'
            : this.#input.step === 'text-price-explanation-v1'
              ? 'price-explanation-v1'
              : 'price-v1'))
    )
      throw new GraphCheckpointFailure('rejected');
    const namespace: unknown = values.checkpoint_ns ?? '';
    const id: unknown = values.checkpoint_id ?? null;
    if (typeof namespace !== 'string' || (id !== null && typeof id !== 'string'))
      throw new GraphCheckpointFailure('rejected');
    const address = {
      version: 1 as const,
      eventId: this.#input.eventId,
      runId: this.#input.runId,
      threadId: this.#input.threadId,
      executionId: this.#input.executionId,
      graphVersion:
        this.#input.step === 'routed-text-v1'
          ? ('intent-routing-v1' as const)
          : this.#input.step === 'text-price-explanation-v1'
            ? ('price-explanation-v1' as const)
            : ('price-v1' as const),
      namespace,
    };
    try {
      parseCheckpointRequest({ ...address, operation: 'get', checkpointId: id });
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
    return { address, id };
  }
  private config(namespace: string, id: string): RunnableConfig {
    return {
      configurable: {
        thread_id: this.#input.threadId,
        checkpoint_ns: namespace,
        checkpoint_id: id,
      },
    };
  }
  private async call(config: RunnableConfig, operation: CheckpointOperation) {
    const { address } = this.address(config);
    this.signal.throwIfAborted();
    let request;
    try {
      request = parseCheckpointRequest({ ...address, ...operation });
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
    return this.adapter.execute(request, this.#input.checkpointGrant, this.signal, this.deadlineAt);
  }
  public assertCanonical(value: unknown): void {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new GraphCheckpointFailure('rejected', 'canonical-schema');
    if ('executionId' in value || 'toolGrant' in value || 'checkpointGrant' in value)
      throw new GraphCheckpointFailure('rejected', 'canonical-schema');
    let input;
    try {
      input = parseRunExecutionRequest({
        ...value,
        executionId: this.#input.executionId,
        toolGrant: this.#input.toolGrant,
        checkpointGrant: this.#input.checkpointGrant,
      });
    } catch {
      throw new GraphCheckpointFailure('rejected', 'canonical-schema');
    }
    if (
      input.step === 'foundation' ||
      input.version !== this.#input.version ||
      input.eventId !== this.#input.eventId ||
      input.runId !== this.#input.runId ||
      input.threadId !== this.#input.threadId ||
      input.step !== this.#input.step ||
      input.query !== this.#input.query ||
      input.locale !== this.#input.locale ||
      (input.inputs === null || this.#input.inputs === null
        ? input.inputs !== this.#input.inputs
        : !sameAskInputs(input.inputs, this.#input.inputs))
    )
      throw new GraphCheckpointFailure('rejected', 'canonical-values');
  }
  public assertTuple(tuple: CheckpointTuple): void {
    let found = false;
    const inspect = (channel: string, value: unknown) => {
      if (channel === 'input') {
        this.assertCanonical(value);
        found = true;
      }
      if (channel === '__start__' && value && typeof value === 'object' && 'input' in value) {
        this.assertCanonical(value.input);
        found = true;
      }
    };
    for (const [channel, value] of Object.entries(tuple.checkpoint.channel_values))
      inspect(channel, value);
    for (const [, channel, value] of tuple.pendingWrites ?? []) inspect(channel, value);
    if (!found) throw new GraphCheckpointFailure('rejected');
  }
  private async encode(value: unknown): Promise<CheckpointBytes> {
    const [type, bytes] = await this.serde.dumpsTyped(value);
    if (type !== 'json' && type !== 'bytes') throw new GraphCheckpointFailure('rejected');
    return { type, base64: Buffer.from(bytes).toString('base64') };
  }
  private async decode(value: CheckpointBytes): Promise<unknown> {
    try {
      return await this.serde.loadsTyped(value.type, Buffer.from(value.base64, 'base64'));
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
  }
  private async tuple(record: CheckpointRecord, namespace: string): Promise<CheckpointTuple> {
    try {
      parseCheckpointRecord(record);
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
    let checkpoint: Checkpoint;
    let metadata: CheckpointMetadata;
    try {
      checkpoint = checkpointSchema.parse(await this.decode(record.checkpoint));
      metadata = metadataSchema.parse(await this.decode(record.metadata));
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
    if (checkpoint.id !== record.checkpointId) throw new GraphCheckpointFailure('rejected');
    const pendingWrites: NonNullable<CheckpointTuple['pendingWrites']> = [];
    for (const write of record.pendingWrites)
      pendingWrites.push([write.taskId, write.channel, await this.decode(write.value)]);
    const tuple: CheckpointTuple = {
      config: this.config(namespace, record.checkpointId),
      checkpoint,
      metadata,
      pendingWrites,
      ...(record.parentId ? { parentConfig: this.config(namespace, record.parentId) } : {}),
    };
    this.assertTuple(tuple);
    this.#acknowledged.add(`${namespace}:${record.checkpointId}`);
    return tuple;
  }
  public override async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { address, id } = this.address(config);
    const response = await this.call(config, { operation: 'get', checkpointId: id });
    if (response.operation !== 'get') throw new GraphCheckpointFailure('rejected');
    return response.record ? this.tuple(response.record, address.namespace) : undefined;
  }
  public override async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { address, id } = this.address(config);
    if (id || options?.filter !== undefined) throw new GraphCheckpointFailure('rejected');
    const previous = options?.before ? this.address(options.before) : null;
    if (previous && (previous.address.namespace !== address.namespace || !previous.id))
      throw new GraphCheckpointFailure('rejected');
    const before = previous?.id ?? null;
    const response = await this.call(config, {
      operation: 'list',
      beforeId: before,
      limit: options?.limit ?? 20,
    });
    if (response.operation !== 'list') throw new GraphCheckpointFailure('rejected');
    for (const record of response.records) yield await this.tuple(record, address.namespace);
  }
  public override put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const work = this.persistCheckpoint(config, checkpoint, metadata, newVersions);
    const namespace = config.configurable?.checkpoint_ns ?? '';
    const key = `${namespace}:${checkpoint.id}`;
    this.#checkpointPuts.set(key, work);
    this.#activePuts.add(work);
    this.#putRegistrations.get(key)?.resolve({ work });
    this.#putRegistrations.delete(key);
    void work.then(
      () => {
        this.#activePuts.delete(work);
        this.#acknowledged.add(key);
      },
      (error: unknown) => {
        this.#activePuts.delete(work);
        for (const registration of this.#putRegistrations.values()) registration.reject(error);
        this.#putRegistrations.clear();
      },
    );
    return work;
  }
  private async checkpointAcknowledged(key: string): Promise<void> {
    if (this.#acknowledged.has(key)) return;
    const registered = this.#checkpointPuts.get(key);
    if (registered) {
      await this.untilDeadline(registered);
      return;
    }
    // A persisted checkpoint needs no local put. A future SDK checkpoint may instead
    // be queued behind an in-flight put and not have reached saver.put at all yet.
    // Rendezvous on that future registration, never retry an unknown remote write.
    if (this.#activePuts.size === 0) return;
    let registration = this.#putRegistrations.get(key);
    if (!registration) {
      let resolve!: (value: { readonly work: Promise<RunnableConfig> }) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise<{ readonly work: Promise<RunnableConfig> }>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      registration = { promise, resolve, reject };
      this.#putRegistrations.set(key, registration);
    }
    // Each waiter owns its cancellation race; none removes another waiter's rendezvous.
    const pending = await this.untilDeadline(registration.promise);
    await this.untilDeadline(pending.work);
  }
  private async untilDeadline<T>(work: Promise<T>): Promise<T> {
    const remaining = this.deadlineAt - Date.now();
    if (this.signal.aborted || remaining <= 0) throw new GraphCheckpointFailure('cancelled');
    let reject!: (reason: unknown) => void;
    const stopped = new Promise<never>((_resolve, no) => {
      reject = no;
    });
    const abort = () => reject(new GraphCheckpointFailure('cancelled'));
    const timer = setTimeout(abort, Math.min(remaining, 2_147_483_647));
    this.signal.addEventListener('abort', abort, { once: true });
    try {
      return await Promise.race([work, stopped]);
    } finally {
      clearTimeout(timer);
      this.signal.removeEventListener('abort', abort);
    }
  }
  private async persistCheckpoint(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    void _newVersions;
    const { address, id } = this.address(config);
    if (metadata.source !== 'input' && metadata.source !== 'loop')
      throw new GraphCheckpointFailure('rejected');
    const safeMetadata: CheckpointMetadata = {
      source: metadata.source,
      step: metadata.step,
      parents: { ...metadata.parents },
      ...(metadata.counters_since_delta_snapshot
        ? { counters_since_delta_snapshot: metadata.counters_since_delta_snapshot }
        : {}),
    };
    const copy = copyCheckpoint(checkpoint);
    try {
      checkpointSchema.parse(copy);
      metadataSchema.parse(safeMetadata);
    } catch {
      throw new GraphCheckpointFailure('rejected');
    }
    this.assertTuple({ config, checkpoint: copy });
    const response = await this.call(config, {
      operation: 'put',
      checkpointId: checkpoint.id,
      parentId: id,
      checkpoint: await this.encode(copy),
      metadata: await this.encode(safeMetadata),
    });
    if (response.operation !== 'put') throw new GraphCheckpointFailure('rejected');
    return this.config(address.namespace, checkpoint.id);
  }
  public override async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const { address, id } = this.address(config);
    if (!id) throw new GraphCheckpointFailure('rejected');
    const values = [];
    for (const [index, [channel, value]] of writes.entries()) {
      const safe =
        channel === '__error__' ? { name: 'Error', message: 'Execution unavailable.' } : value;
      if (channel === 'input') this.assertCanonical(safe);
      if (channel === '__start__' && safe && typeof safe === 'object' && 'input' in safe)
        this.assertCanonical(safe.input);
      values.push({
        index: WRITES_IDX_MAP[channel] ?? index,
        channel,
        value: await this.encode(safe),
      });
    }
    // The installed loop chains put asynchronously but launches putWrites independently.
    // A previous network-delayed ACK may prevent this checkpoint's put from being invoked.
    // Coordinate both future registration and commit before its FK-bound writes.
    await this.checkpointAcknowledged(`${address.namespace}:${id}`);
    const response = await this.call(config, {
      operation: 'put-writes',
      checkpointId: id,
      taskId,
      writes: values,
    });
    if (response.operation !== 'put-writes') throw new GraphCheckpointFailure('rejected');
  }
  public override async deleteThread(_threadId: string): Promise<void> {
    void _threadId;
    throw new GraphCheckpointFailure('rejected');
  }
}
