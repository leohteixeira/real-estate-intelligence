import { Module } from '@nestjs/common';

import { CollectionAuditConsumer } from './collection-audit.consumer';

@Module({ providers: [CollectionAuditConsumer], exports: [CollectionAuditConsumer] })
export class CollectionModule {}
