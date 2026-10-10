import { Inject, Injectable, Logger } from '@nestjs/common';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { ExpireSnapshots, type SnapshotRetention } from '@rei/application';
import { readScheduledCollectionConfig } from '../config';

const tracer = trace.getTracer('rei.worker.snapshot-retention');
const meter = metrics.getMeter('rei.worker.snapshot-retention');
const cycles = meter.createCounter('rei.snapshot_retention.cycles');
const reconciliations = meter.createCounter('rei.snapshot_retention.reconciled_generations');
const durations = meter.createHistogram('rei.snapshot_retention.duration_ms');

@Injectable()
export class SnapshotRetentionJob {
  private readonly logger = new Logger(SnapshotRetentionJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private controller: AbortController | undefined;
  public constructor(@Inject(ExpireSnapshots) private readonly retention: SnapshotRetention) {}
  public start(): void {
    if (this.timer) return;
    const config = readScheduledCollectionConfig(process.env);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), config.snapshotRetentionIntervalMs);
  }
  private schedule(): void {
    if (this.running) return;
    const controller = new AbortController();
    this.controller = controller;
    this.running = this.runCycle(controller.signal)
      .catch(() => undefined)
      .finally(() => {
        this.running = undefined;
        if (this.controller === controller) this.controller = undefined;
      });
  }
  /** Public cycle is also the deterministic integration seam; production always uses system time. */
  public async runCycle(signal: AbortSignal): Promise<void> {
    const config = readScheduledCollectionConfig(process.env);
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    const started = performance.now();
    const timeout = setTimeout(() => controller.abort(), config.snapshotRetentionCycleTimeoutMs);
    try {
      await tracer.startActiveSpan('snapshot-retention.cycle', async (span) => {
        let result = 'succeeded';
        try {
          const count = await this.retention.expire(
            config.snapshotRetentionBatchSize,
            controller.signal,
            Date.now() + config.snapshotRetentionCycleTimeoutMs,
          );
          reconciliations.add(count);
        } catch {
          result = controller.signal.aborted ? 'cancelled' : 'failed';
          if (result === 'failed') {
            this.logger.warn('Snapshot retention failed');
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
        } finally {
          cycles.add(1, { result });
          span.setAttribute('result', result);
          span.end();
        }
      });
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
      durations.record(performance.now() - started);
    }
  }
  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    await this.running;
  }
}
