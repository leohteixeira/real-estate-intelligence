import { Module } from '@nestjs/common';
import { RunExecutorModule } from './run-executor.module';
import { ResilienceTelemetry } from '../shared/resilience/resilience-telemetry';

/** No persistence, broker, collection or scheduler dependency enters this explicit command. */
@Module({ imports: [RunExecutorModule], providers: [ResilienceTelemetry] })
export class RunCommandModule {}
