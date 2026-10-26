import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  ASK_FACADE,
  ASK_LIVE_FACADE,
  AskQueryService,
  AskRunService,
  GRAPH_CHECKPOINT_PORT,
  GraphCheckpointService,
  MARKET_CALCULATION_FACADE,
  type MarketCalculationFacade,
  OUTBOX_APPEND_PORT,
  TRANSACTION_RUNNER,
  type OutboxAppendPort,
  type TransactionRunner,
  MODEL_EXPLANATION_REPOSITORY,
} from '@rei/application';
import {
  SyntheticAskAdapter,
  PostgresAskRunRepository,
  PostgresGraphCheckpointRepository,
  type DatabaseConnection,
  PostgresModelExplanationRepository,
} from '@rei/infrastructure';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';
import { readAskConfig } from './ask.config';
import { AskController } from './ask.controller';
import { AskLiveController } from './ask-live.controller';
import { AskDispatchController } from './ask-dispatch.controller';
import { AskToolController } from './ask-tool.controller';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { MarketModule } from '../market/index';
import { GraphCheckpointController } from './graph-checkpoint.controller';
import { GraphCheckpointRetentionJob } from './graph-checkpoint-retention.job';
import { AskQueueExpiryJob } from './ask-queue-expiry.job';
import { AskInternalController, AskDecisionController } from './ask-internal.controller';

@Module({
  imports: [MarketModule],
  controllers: [
    AskController,
    AskLiveController,
    AskDispatchController,
    AskToolController,
    GraphCheckpointController,
    AskInternalController,
    AskDecisionController,
  ],
  providers: [
    {
      provide: MODEL_EXPLANATION_REPOSITORY,
      inject: [DATABASE_CONNECTION, TRANSACTION_RUNNER],
      useFactory: (connection: DatabaseConnection, transactions: TransactionRunner) =>
        new PostgresModelExplanationRepository(connection, transactions),
    },
    AskQueueExpiryJob,
    GraphCheckpointRetentionJob,
    {
      provide: GRAPH_CHECKPOINT_PORT,
      inject: [DATABASE_CONNECTION, TRANSACTION_RUNNER],
      useFactory: (connection: DatabaseConnection, transactions: TransactionRunner) =>
        new GraphCheckpointService(new PostgresGraphCheckpointRepository(connection, transactions)),
    },
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
        new AskRunService(
          new PostgresAskRunRepository(
            connection,
            transactions,
            outbox,
            readAskConfig(process.env).quotas,
          ),
          market,
        ),
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
