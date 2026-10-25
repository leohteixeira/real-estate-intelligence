import { Controller, Get, Inject, Res } from '@nestjs/common';
import {
  BROKER_AVAILABILITY_PROBE,
  type BrokerAvailabilityProbe,
  DATABASE_AVAILABILITY_PROBE,
  type DatabaseAvailabilityProbe,
} from '@rei/application';
import type { HealthResponse, ReadinessResponse } from '@rei/contracts';
import type { Response } from 'express';

const READINESS_TIMEOUT_MS = 2_000;

@Controller()
export class HealthController {
  public constructor(
    @Inject(DATABASE_AVAILABILITY_PROBE)
    private readonly probe: DatabaseAvailabilityProbe,
    @Inject(BROKER_AVAILABILITY_PROBE)
    private readonly brokerProbe: BrokerAvailabilityProbe,
  ) {}

  /** Liveness: the process is up. It never touches a dependency. */
  @Get('health')
  public health(): HealthResponse {
    return { status: 'healthy' };
  }

  /** Readiness: the process can serve traffic, which requires the database and authenticated broker. */
  @Get('ready')
  public async ready(@Res() response: Response<ReadinessResponse>): Promise<void> {
    const signal = AbortSignal.timeout(READINESS_TIMEOUT_MS);
    const [database, broker] = await Promise.all([
      this.probe.isAvailable(signal),
      this.brokerProbe.isAvailable(signal),
    ]);
    const ready = database && broker;
    response.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not-ready',
      database: database ? 'available' : 'unavailable',
      broker: broker ? 'available' : 'unavailable',
    });
  }
}
