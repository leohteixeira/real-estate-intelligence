import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HeartbeatJob } from './heartbeat.job';
import { PersistenceModule } from './persistence.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PersistenceModule],
  providers: [HeartbeatJob],
})
export class WorkerModule {}
