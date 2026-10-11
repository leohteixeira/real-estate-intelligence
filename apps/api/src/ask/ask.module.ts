import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  ASK_FACADE,
  ASK_LIVE_FACADE,
  AskQueryService,
  AskRunService,
  MARKET_CALCULATION_FACADE,
  type MarketCalculationFacade,
  OUTBOX_APPEND_PORT,
  TRANSACTION_RUNNER,
  type OutboxAppendPort,
  type TransactionRunner,
} from '@rei/application';
import {
  SyntheticAskAdapter,
  PostgresAskRunRepository,
  type DatabaseConnection,
} from '@rei/infrastructure';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';
import { AskController } from './ask.controller';
import { AskLiveController } from './ask-live.controller';
import { AskDispatchController } from './ask-dispatch.controller';
import { AskToolController } from './ask-tool.controller';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { MarketModule } from '../market/index';

@Module({
  imports: [MarketModule],
  controllers: [AskController, AskLiveController, AskDispatchController, AskToolController],
  providers: [
    { provide: ASK_FACADE, useFactory: () => new AskQueryService(new SyntheticAskAdapter()) },
    {
      provide: ASK_LIVE_FACADE,
      inject: [
        DATABASE_CONNECTION,
        TRANSACTION_RUNNER,
        OUTBOX_APPEND_PORT,
        MARKET_CALCULATION_FACADE,
      ],
      useFactory: (
        connection: DatabaseConnection,
        transactions: TransactionRunner,
        outbox: OutboxAppendPort,
        market: MarketCalculationFacade,
      ) =>
        new AskRunService(new PostgresAskRunRepository(connection, transactions, outbox), market),
    },
  ],
  exports: [ASK_FACADE],
})
export class AskModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['ask', 'threads', 'runs']);
  }
}
