import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EVENT_PUBLISHER,
  OUTBOX_RELAY_PORT,
  type EventPublisher,
  type OutboxRelayPort,
} from '@rei/application';
import { runOutboxPublishSpan } from '@rei/infrastructure';

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
    const { claimLeaseMs, relayBatchSize, operationTimeoutMs } = readConfig(process.env);
    const events = await this.outbox.claimPending(relayBatchSize, claimLeaseMs);
    const outcomes = await Promise.allSettled(
      events.map((event) => this.publishClaim(event, signal, operationTimeoutMs)),
    );
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map(({ reason }) => reason),
        `${failures.length} outbox claim(s) failed.`,
      );
    }
  }

  private async publishClaim(
    event: Awaited<ReturnType<OutboxRelayPort['claimPending']>>[number],
    signal: AbortSignal,
    operationTimeoutMs: number,
  ): Promise<void> {
    try {
      signal.throwIfAborted();
      const deadlineAt = Date.now() + operationTimeoutMs;
      const publicationSignal = AbortSignal.any([signal, AbortSignal.timeout(operationTimeoutMs)]);
      await runOutboxPublishSpan(event.traceContext, publicationSignal, () =>
        this.publisher.publish(event, publicationSignal, deadlineAt),
      );
    } catch (error) {
      await this.outbox.releaseClaim(event.eventId, event.claimId);
      throw error;
    }
    await this.outbox.markPublished(event.eventId, event.claimId);
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
