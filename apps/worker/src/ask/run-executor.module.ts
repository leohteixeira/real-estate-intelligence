import { Module } from '@nestjs/common';
import { ExternalFailure, RUN_EXECUTOR, type RunExecutor } from '@rei/application';
import { HttpRunExecutor } from '@rei/infrastructure';
import { readRunExecutorConfig } from './run-executor.config';
import { ResilientRunExecutor } from './resilient-run-executor';

/** Shared execution capability, independent of durable consumers and worker infrastructure. */
@Module({
  providers: [
    {
      provide: RUN_EXECUTOR,
      useFactory: (): RunExecutor => {
        const config = readRunExecutorConfig(process.env);
        if (!config)
          return {
            execute: () =>
              Promise.reject(
                new ExternalFailure({ kind: 'forbidden', operation: 'run-executor.execute' }),
              ),
          };
        return new ResilientRunExecutor(new HttpRunExecutor(config));
      },
    },
  ],
  exports: [RUN_EXECUTOR],
})
export class RunExecutorModule {}
