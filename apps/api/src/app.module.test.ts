import 'reflect-metadata';

import { ConfigModule } from '@nestjs/config';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

import { AlertsModule } from './alerts/alerts.module';
import { AppModule } from './app.module';
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

const contextModules = [
  PropertiesModule,
  MarketModule,
  ComparablesModule,
  CollectionModule,
  LocationsModule,
  AskModule,
  AlertsModule,
  AuditModule,
  IdentityModule,
];

describe('AppModule context composition', () => {
  it('imports only the operational modules and each bounded context exactly once', async () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) as unknown[];
    const resolvedImports = await Promise.all(imports);

    expect(resolvedImports).toEqual([
      expect.objectContaining({ module: ConfigModule }),
      PersistenceModule,
      HealthModule,
      ...contextModules,
    ]);
  });
});
