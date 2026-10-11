import { Module } from '@nestjs/common';

import { GraphModule } from './graph/graph.module';
import { HealthModule } from './health/health.module';
import { ExecutionModule } from './execution/execution.module';
import { TelemetryModule } from './telemetry.module';

@Module({ imports: [HealthModule, GraphModule, ExecutionModule, TelemetryModule] })
export class AppModule {}
