import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { PersistenceModule } from './persistence/persistence.module';

/**
 * Composition root. NestJS owns HTTP and application orchestration; business
 * rules live in @rei/domain and @rei/application.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PersistenceModule, HealthModule, AuditModule],
})
export class AppModule {}
