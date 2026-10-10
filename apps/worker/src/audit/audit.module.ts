import { Module } from '@nestjs/common';

import { AuditTraceConsumer } from './audit-trace.consumer';

@Module({
  providers: [AuditTraceConsumer],
})
export class AuditModule {}
