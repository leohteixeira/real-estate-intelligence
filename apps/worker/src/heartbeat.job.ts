import { Inject, Injectable, Logger } from '@nestjs/common';
import { DATABASE_AVAILABILITY_PROBE, type DatabaseAvailabilityProbe } from '@rei/application';

import { readConfig } from './config';

const PROBE_TIMEOUT_MS = 2_000;

/**
 * Placeholder job. It proves the module wiring, the configuration and the
 * graceful shutdown path before any crawler exists.
 */
@Injectable()
export class HeartbeatJob {
  private readonly logger = new Logger(HeartbeatJob.name);
  private timer: NodeJS.Timeout | undefined;

  public constructor(
    @Inject(DATABASE_AVAILABILITY_PROBE)
    private readonly probe: DatabaseAvailabilityProbe,
  ) {}

  public start(): void {
    const { intervalMs } = readConfig(process.env);

    void this.tick();
    this.timer = setInterval(() => void this.tick(), intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async tick(): Promise<void> {
    const available = await this.probe.isAvailable(AbortSignal.timeout(PROBE_TIMEOUT_MS));

    this.logger.log(`heartbeat, database available: ${String(available)}`);
  }
}
