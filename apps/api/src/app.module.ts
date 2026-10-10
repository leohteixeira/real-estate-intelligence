import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AlertsModule } from './alerts/alerts.module';
import { AskModule } from './ask/ask.module';
import { AuditModule } from './audit/audit.module';
import { CollectionModule } from './collection/collection.module';
import { ComparablesModule } from './comparables/comparables.module';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './identity/identity.module';
import { LocationsModule } from './locations/locations.module';
import { MarketModule } from './market/market.module';
import { PersistenceModule } from './persistence/persistence.module';
import { PropertiesModule } from './properties/properties.module';

/**
 * Composition root. NestJS owns HTTP and application orchestration; business
 * rules live in @rei/domain and @rei/application.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PersistenceModule,
    HealthModule,
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
})
export class AppModule {}
