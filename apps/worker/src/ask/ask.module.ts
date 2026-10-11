import { Module } from '@nestjs/common';
import {
  ConsumeAskRunRequest,
  ExternalFailure,
  RUN_DISPATCH,
  RUN_EXECUTOR,
  type RunDispatch,
  type RunExecutor,
} from '@rei/application';
import { HttpRunDispatch } from '@rei/infrastructure';
import { readRunDispatchConfig } from './run-dispatch.config';
import { ResilientRunDispatch } from './resilient-run-dispatch';
import { AskRunRequestConsumer } from './ask-run-request.consumer';
import { RunExecutorModule } from './run-executor.module';

@Module({
  imports: [RunExecutorModule],
  providers: [
    AskRunRequestConsumer,
    {
      provide: RUN_DISPATCH,
      useFactory: (): RunDispatch => {
        const config = readRunDispatchConfig(process.env);
        if (config) return new ResilientRunDispatch(new HttpRunDispatch(config));
        const unavailable = () =>
          Promise.reject(new ExternalFailure({ kind: 'forbidden', operation: 'run-dispatch' }));
        return { claim: unavailable, complete: unavailable };
      },
    },
    {
      provide: ConsumeAskRunRequest,
      inject: [RUN_DISPATCH, RUN_EXECUTOR],
      useFactory: (dispatch: RunDispatch, executor: RunExecutor) =>
        new ConsumeAskRunRequest(dispatch, executor),
    },
  ],
  exports: [RunExecutorModule, AskRunRequestConsumer],
})
export class AskModule {}
