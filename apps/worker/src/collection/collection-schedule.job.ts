import { Injectable, Logger } from '@nestjs/common';
import { RequestDueCollectionRuns } from '@rei/application';

import { readScheduledCollectionConfig } from '../config';

@Injectable()
export class CollectionScheduleJob {
  private readonly logger = new Logger(CollectionScheduleJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private controller: AbortController | undefined;

  public constructor(private readonly requestDueRuns: RequestDueCollectionRuns) {}

  public start(): void {
    if (this.timer) return;
    const { pollIntervalMs } = readScheduledCollectionConfig(process.env);
    this.schedulePoll();
    this.timer = setInterval(() => this.schedulePoll(), pollIntervalMs);
  }

  private schedulePoll(): void {
    if (this.running) return;
    const controller = new AbortController();
    this.controller = controller;
    this.running = this.poll(controller.signal)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          this.logger.warn(
            `collection schedule poll failed (${error instanceof Error ? error.name : 'Error'})`,
          );
        }
      })
      .finally(() => {
        if (this.controller === controller) this.controller = undefined;
        this.running = undefined;
      });
  }

  private async poll(signal: AbortSignal): Promise<void> {
    const { claimBatchSize } = readScheduledCollectionConfig(process.env);
    const claimed = await this.requestDueRuns.execute(claimBatchSize, null, signal);
    if (claimed.length > 0)
      this.logger.log(`requested ${claimed.length} scheduled collection run(s)`);
  }

  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.controller?.abort(new Error('Collection scheduling is stopping.'));
    await this.running?.catch(() => undefined);
  }
}
