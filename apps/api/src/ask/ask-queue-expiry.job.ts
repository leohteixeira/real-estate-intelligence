import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { ASK_LIVE_FACADE, type AskLiveFacade } from '@rei/application';
import { askQueueExpirySettings as settings } from './ask-queue-expiry.settings';

@Injectable()
export class AskQueueExpiryJob implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(AskQueueExpiryJob.name);
  private readonly expiredRuns = metrics
    .getMeter('rei.api.ask-queue-expiry')
    .createCounter('rei.ask.queue.expired_runs');
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private controller: AbortController | undefined;
  public constructor(
    @Inject(ASK_LIVE_FACADE) private readonly live: Pick<AskLiveFacade, 'expireQueued'>,
  ) {}
  public onApplicationBootstrap(): void {
    this.start();
  }
  public start(): void {
    if (this.timer) return;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), settings.intervalMs);
  }
  private schedule(): void {
    if (this.running) return;
    const controller = new AbortController();
    this.controller = controller;
    const deadline = setTimeout(() => controller.abort(), settings.deadlineMs);
    this.running = trace
      .getTracer('rei.api.ask-queue-expiry')
      .startActiveSpan('ask.queue.expire', async (span) => {
        let outcome = 'succeeded';
        let count = 0;
        try {
          count = await this.live.expireQueued(settings.batchSize, controller.signal);
        } catch {
          outcome = controller.signal.aborted ? 'cancelled' : 'failed';
          if (outcome === 'failed') {
            span.setStatus({ code: SpanStatusCode.ERROR });
            this.logger.warn('Ask queue expiry failed.');
          }
        } finally {
          span.setAttributes({ outcome, count });
          span.end();
          this.expiredRuns.add(count, { outcome });
        }
      })
      .finally(() => {
        clearTimeout(deadline);
        this.controller = undefined;
        this.running = undefined;
      });
  }
  public async beforeApplicationShutdown(): Promise<void> {
    await this.stop();
  }
  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.controller?.abort();
    await this.running;
  }
}
