import { Module } from '@nestjs/common';
import { AiTelemetryLifecycle, TELEMETRY_SHUTDOWN } from './telemetry-lifecycle';
import { telemetryShutdownCallback } from './telemetry-shutdown';

@Module({
  providers: [
    { provide: TELEMETRY_SHUTDOWN, useFactory: telemetryShutdownCallback },
    AiTelemetryLifecycle,
  ],
})
export class TelemetryModule {}
