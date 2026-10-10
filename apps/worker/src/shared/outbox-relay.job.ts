import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  OUTBOX_RELAY_PORT,
  type EventPublisher,
  type OutboxRelayPort,
} from '@rei/application';

import { readConfig } from '../config';

@Injectable()
export class OutboxRelayJob {
  private readonly logger = new Logger(OutboxRelayJob.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private pollController: AbortController | undefined;

  public constructor(
    @Inject(OUTBOX_RELAY_PORT) private readonly outbox: OutboxRelayPort,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  public start(): void {
    if (this.timer) {
      return;
    }
    const { relayIntervalMs } = readConfig(process.env);
    this.schedulePoll();
    this.timer = setInterval(() => this.schedulePoll(), relayIntervalMs);
  }

  private schedulePoll(): void {
    if (this.running) {
      return;
    }
    const controller = new AbortController();
    this.pollController = controller;
    this.running = this.poll(controller.signal)
      .catch((error: unknown) => {
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.warn(`outbox relay attempt failed (${name})`);
      })
      .finally(() => {
        if (this.pollController === controller) {
          this.pollController = undefined;
        }
        this.running = undefined;
      });
  }

  private async poll(signal: AbortSignal): Promise<void> {
    const { relayBatchSize, operationTimeoutMs } = readConfig(process.env);
    const events = await this.outbox.claimPending(relayBatchSize);
    for (const event of events) {
      signal.throwIfAborted();
      await this.publisher.publish(
        event,
        AbortSignal.any([signal, AbortSignal.timeout(operationTimeoutMs)]),
      );
      await this.outbox.markPublished(event.eventId);
    }
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.pollController?.abort(new Error('Worker is shutting down.'));
    const { shutdownTimeoutMs } = readConfig(process.env);
    if (this.running) {
      await Promise.race([
        this.running,
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, shutdownTimeoutMs);
          timer.unref();
        }),
      ]);
    }
  }
}
