import { Injectable, Logger } from '@nestjs/common';
import { RabbitMqEventBroker } from '@rei/infrastructure';

import { readConfig } from '../config';

@Injectable()
export class BrokerConnectionSupervisor {
  private readonly logger = new Logger(BrokerConnectionSupervisor.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private reconnectController: AbortController | undefined;

  public constructor(private readonly broker: RabbitMqEventBroker) {}

  public start(): void {
    if (this.timer) {
      return;
    }
    const { reconnectIntervalMs } = readConfig(process.env);
    this.tick();
    this.timer = setInterval(() => this.tick(), reconnectIntervalMs);
  }

  private tick(): void {
    if (this.running) {
      return;
    }
    const controller = new AbortController();
    this.reconnectController = controller;
    const running = this.broker
      .start(controller.signal)
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.warn(`RabbitMQ connection attempt failed (${name})`);
      })
      .finally(() => {
        if (this.reconnectController === controller) {
          this.reconnectController = undefined;
        }
        if (this.running === running) {
          this.running = undefined;
        }
      });
    this.running = running;
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.reconnectController?.abort(new Error('RabbitMQ reconnect supervisor stopped.'));
    await this.running;
  }
}
