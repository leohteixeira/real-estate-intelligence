import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { GRAPH_CHECKPOINT_PORT, type GraphCheckpointPort } from '@rei/application';
import { graphCheckpointRetentionSettings as settings } from './graph-checkpoint-retention.settings';
@Injectable()
export class GraphCheckpointRetentionJob
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(GraphCheckpointRetentionJob.name);
  private readonly prunedRuns = metrics
    .getMeter('rei.api.ask-checkpoint-retention')
    .createCounter('rei.ask.checkpoints.pruned_runs');
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private controller: AbortController | undefined;
  public constructor(
    @Inject(GRAPH_CHECKPOINT_PORT) private readonly checkpoints: GraphCheckpointPort,
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
      .getTracer('rei.api.ask-checkpoint-retention')
      .startActiveSpan('ask.checkpoints.prune', async (span) => {
        let outcome = 'succeeded';
        let count = 0;
        try {
          count = await this.checkpoints.prune(settings.batchSize, controller.signal);
        } catch {
          outcome = controller.signal.aborted ? 'cancelled' : 'failed';
          if (outcome === 'failed') {
            span.setStatus({ code: SpanStatusCode.ERROR });
            this.logger.warn('Ask checkpoint retention failed.');
          }
        } finally {
          span.setAttributes({ outcome, count });
          span.end();
          this.prunedRuns.add(count, { outcome });
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
