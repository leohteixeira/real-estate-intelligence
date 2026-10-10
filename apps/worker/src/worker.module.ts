import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditTraceConsumer } from './audit/audit-trace.consumer';
import { HeartbeatJob } from './heartbeat.job';
import { PersistenceModule } from './persistence.module';
import { MessagingModule } from './shared/messaging.module';
import { OutboxRelayJob } from './shared/outbox-relay.job';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PersistenceModule, MessagingModule],
  providers: [HeartbeatJob, OutboxRelayJob, AuditTraceConsumer],
})
export class WorkerModule {}
