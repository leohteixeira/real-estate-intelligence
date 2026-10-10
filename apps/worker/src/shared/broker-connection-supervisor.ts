import { Injectable, Logger } from '@nestjs/common';
import { RabbitMqEventBroker } from '@rei/infrastructure';

import { readConfig } from '../config';

@Injectable()
export class BrokerConnectionSupervisor {
  private readonly logger = new Logger(BrokerConnectionSupervisor.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

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
    this.running = this.broker
      .start()
      .catch((error: unknown) => {
        const name = error instanceof Error ? error.name : 'Error';
        this.logger.warn(`RabbitMQ connection attempt failed (${name})`);
      })
      .finally(() => {
        this.running = undefined;
      });
  }

  public async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.running;
  }
}
