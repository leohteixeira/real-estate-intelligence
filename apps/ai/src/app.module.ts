import { Module } from '@nestjs/common';

import { GraphModule } from './graph/graph.module';
import { HealthModule } from './health/health.module';
import { ExecutionModule } from './execution/execution.module';

@Module({ imports: [HealthModule, GraphModule, ExecutionModule] })
export class AppModule {}
