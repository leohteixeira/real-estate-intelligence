import { Inject, Injectable, Logger } from '@nestjs/common';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  INBOX_RETENTION_PORT,
  OUTBOX_RETENTION_PORT,
  type InboxRetentionPort,
  type OutboxRetentionPort,
} from '@rei/application';

import { readConfig } from '../config';

type Store = 'outbox' | 'inbox';
type Result = 'succeeded' | 'failed' | 'cancelled';
interface StoreOutcome {
  readonly store: Store;
  readonly result: Result;
  readonly deleted: number;
  readonly errorName?: string;
}

const tracer = trace.getTracer('rei.worker.delivery-retention');
const meter = metrics.getMeter('rei.worker.delivery-retention');
const cycleCounter = meter.createCounter('rei.delivery_retention.cycles');
const storeCounter = meter.createCounter('rei.delivery_retention.store_operations');
const deletedCounter = meter.createCounter('rei.delivery_retention.deleted_rows');
const durationHistogram = meter.createHistogram('rei.delivery_retention.duration_ms');
const cancellationCounter = meter.createCounter('rei.delivery_retention.cancellations');

function isCancellation(error: unknown, signal: AbortSignal): boolean {
  return (
    signal.aborted &&
    (error === signal.reason || (error instanceof Error && error.name === 'AbortError'))
  );
}

@Injectable()
export class DeliveryRetentionJob {
  private readonly logger = new Logger(DeliveryRetentionJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private cycleController: AbortController | undefined;

  public constructor(
    @Inject(OUTBOX_RETENTION_PORT) private readonly outbox: OutboxRetentionPort,
    @Inject(INBOX_RETENTION_PORT) private readonly inbox: InboxRetentionPort,
  ) {}

  public start(): void {
    if (this.timer) return;
    const { retentionIntervalMs } = readConfig(process.env);
    this.scheduleCycle();
    this.timer = setInterval(() => this.scheduleCycle(), retentionIntervalMs);
  }

  private scheduleCycle(): void {
    if (this.running) return;
    const controller = new AbortController();
    this.cycleController = controller;
    this.running = this.runCycle(controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (this.cycleController === controller) this.cycleController = undefined;
        this.running = undefined;
      });
  }

  private async runCycle(signal: AbortSignal): Promise<void> {
    const started = performance.now();
    await tracer.startActiveSpan('delivery-retention.cycle', async (span) => {
      try {
        const { outboxRetentionMs, inboxRetentionMs, retentionBatchSize } = readConfig(process.env);
        const operations: ReadonlyArray<Promise<StoreOutcome>> = [
          this.classify(
            'outbox',
            this.outbox.prunePublished(outboxRetentionMs, retentionBatchSize, signal),
            signal,
          ),
          this.classify(
            'inbox',
            this.inbox.pruneConsumed(inboxRetentionMs, retentionBatchSize, signal),
            signal,
          ),
        ];
        const settled = await Promise.allSettled(operations);
        const outcomes = settled.map((outcome) =>
          outcome.status === 'fulfilled' ? outcome.value : (outcome.reason as StoreOutcome),
        );

        for (const outcome of outcomes) {
          const attributes = { store: outcome.store, result: outcome.result } as const;
          storeCounter.add(1, attributes);
          deletedCounter.add(outcome.deleted, attributes);
          if (outcome.result === 'cancelled') cancellationCounter.add(1, { store: outcome.store });
          if (outcome.result === 'failed') {
            this.logger.warn(`${outcome.store} retention failed (${outcome.errorName ?? 'Error'})`);
          }
        }

        const cycleResult: Result = outcomes.some(({ result }) => result === 'failed')
          ? 'failed'
          : outcomes.some(({ result }) => result === 'cancelled')
            ? 'cancelled'
            : 'succeeded';
        cycleCounter.add(1, { result: cycleResult });
        span.setAttribute('result', cycleResult);
        if (cycleResult === 'failed') span.setStatus({ code: SpanStatusCode.ERROR });
      } finally {
        durationHistogram.record(performance.now() - started, { job: 'delivery-retention' });
        span.end();
      }
    });
  }

  private async classify(
    store: Store,
    operation: Promise<number>,
    signal: AbortSignal,
  ): Promise<StoreOutcome> {
    try {
      return { store, result: 'succeeded', deleted: await operation };
    } catch (error) {
      const outcome: StoreOutcome = isCancellation(error, signal)
        ? { store, result: 'cancelled', deleted: 0 }
        : {
            store,
            result: 'failed',
            deleted: 0,
            errorName: error instanceof Error ? error.name : 'Error',
          };
      return Promise.reject(outcome);
    }
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.cycleController?.abort(new Error('Worker is shutting down.'));
    await this.running;
  }
}
