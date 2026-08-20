import { Controller, Get, Inject, Res } from '@nestjs/common';
import { DATABASE_AVAILABILITY_PROBE, type DatabaseAvailabilityProbe } from '@rei/application';
import type { HealthResponse, ReadinessResponse } from '@rei/contracts';
import type { Response } from 'express';

const READINESS_TIMEOUT_MS = 2_000;

@Controller()
export class HealthController {
  public constructor(
    @Inject(DATABASE_AVAILABILITY_PROBE)
    private readonly probe: DatabaseAvailabilityProbe,
  ) {}

  /** Liveness: the process is up. It never touches a dependency. */
  @Get('health')
  public health(): HealthResponse {
    return { status: 'healthy' };
  }

  /** Readiness: the process can serve traffic, which requires the database. */
  @Get('ready')
  public async ready(@Res() response: Response<ReadinessResponse>): Promise<void> {
    const available = await this.probe.isAvailable(AbortSignal.timeout(READINESS_TIMEOUT_MS));

    if (!available) {
      response.status(503).json({ status: 'not-ready', database: 'unavailable' });
      return;
    }

    response.status(200).json({ status: 'ready', database: 'available' });
  }
}
