import { Module } from '@nestjs/common';
import { AskModule } from './ask.module';
import { ResilienceTelemetry } from '../shared/resilience/resilience-telemetry';

/** No persistence, broker, collection or scheduler dependency enters this explicit command. */
@Module({ imports: [AskModule], providers: [ResilienceTelemetry] })
export class RunCommandModule {}
