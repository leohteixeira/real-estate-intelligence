import { Module } from '@nestjs/common';
import {
  CLOCK,
  OUTBOX_APPEND_PORT,
  RequestAuditTrace,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  type Clock,
  type OutboxAppendPort,
  type TransactionRunner,
  type UuidV7Generator,
} from '@rei/application';

import { AuditController } from './audit.controller';

@Module({
  controllers: [AuditController],
  providers: [
    {
      provide: CLOCK,
      useValue: { now: (): string => new Date().toISOString() } satisfies Clock,
    },
    {
      provide: RequestAuditTrace,
      inject: [TRANSACTION_RUNNER, UUID_V7_GENERATOR, CLOCK, OUTBOX_APPEND_PORT],
      useFactory: (
        transactions: TransactionRunner,
        identifiers: UuidV7Generator,
        clock: Clock,
        outbox: OutboxAppendPort,
      ): RequestAuditTrace => new RequestAuditTrace(transactions, identifiers, clock, outbox),
    },
  ],
})
export class AuditModule {}
