import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'healthy';
}

@Controller()
export class HealthController {
  /** Liveness only: the process is running and no dependency is consulted. */
  @Get('health')
  public health(): HealthResponse {
    return { status: 'healthy' };
  }
}
