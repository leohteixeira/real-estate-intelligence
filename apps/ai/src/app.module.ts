import { Module } from '@nestjs/common';

import { GraphModule } from './graph/graph.module';
import { HealthModule } from './health/health.module';

@Module({ imports: [HealthModule, GraphModule] })
export class AppModule {}
