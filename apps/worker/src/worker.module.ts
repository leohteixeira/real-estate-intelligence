import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AlertsModule } from './alerts/alerts.module';
import { AskModule } from './ask/ask.module';
import { AuditModule } from './audit/audit.module';
import { CollectionModule } from './collection/collection.module';
import { ComparablesModule } from './comparables/comparables.module';
import { HeartbeatJob } from './heartbeat.job';
import { IdentityModule } from './identity/identity.module';
import { LocationsModule } from './locations/locations.module';
import { MarketModule } from './market/market.module';
import { PersistenceModule } from './persistence.module';
import { PropertiesModule } from './properties/properties.module';
import { MessagingModule } from './shared/messaging.module';
import { BrokerConnectionSupervisor } from './shared/broker-connection-supervisor';
import { OutboxRelayJob } from './shared/outbox-relay.job';
import { DeliveryRetentionJob } from './shared/delivery-retention.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PersistenceModule,
    MessagingModule,
    PropertiesModule,
    MarketModule,
    ComparablesModule,
    CollectionModule,
    LocationsModule,
    AskModule,
    AlertsModule,
    AuditModule,
    IdentityModule,
  ],
  providers: [HeartbeatJob, OutboxRelayJob, DeliveryRetentionJob, BrokerConnectionSupervisor],
})
export class WorkerModule {}
