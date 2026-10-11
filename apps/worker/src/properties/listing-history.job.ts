import { Inject, Injectable, Logger } from '@nestjs/common';
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api';
import { ReconcileListingHistory } from '@rei/application';
import { readListingHistoryConfig } from '../config';

const tracer = trace.getTracer('rei.worker.listing-history');
const effects = metrics
  .getMeter('rei.worker.listing-history')
  .createCounter('rei.listing_history.effects');
@Injectable()
export class ListingHistoryJob {
  private readonly logger = new Logger(ListingHistoryJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private controller: AbortController | undefined;
  public constructor(
    @Inject(ReconcileListingHistory) private readonly service: ReconcileListingHistory,
  ) {}
  public start(): void {
    if (this.timer) return;
    const config = readListingHistoryConfig(process.env);
    this.schedule();
    this.timer = setInterval(() => this.schedule(), config.intervalMs);
  }
  private schedule(): void {
    if (this.running) return;
    const controller = new AbortController();
    this.controller = controller;
    this.running = this.runCycle(controller.signal)
      .catch(() => this.logger.warn('Listing history reconciliation failed'))
      .finally(() => {
        this.running = undefined;
        this.controller = undefined;
      });
  }
  public async runCycle(signal: AbortSignal): Promise<void> {
    const config = readListingHistoryConfig(process.env);
    await tracer.startActiveSpan('properties.listing-history.reconcile', async (span) => {
      try {
        effects.add(
          await this.service.execute(
            config.batchSize,
            AbortSignal.any([signal, AbortSignal.timeout(config.timeoutMs)]),
          ),
        );
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    await this.running;
  }
}
