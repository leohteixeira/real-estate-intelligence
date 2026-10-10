import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  CLOCK,
  EnableSource,
  SOURCE_REGISTER_REPOSITORY,
  type Clock,
  type SourceRegisterRepository,
} from '@rei/application';
import { PostgresSourceRegisterRepository, type DatabaseConnection } from '@rei/infrastructure';

import { DATABASE_CONNECTION, PersistenceModule } from '../persistence.module';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PersistenceModule],
  providers: [
    {
      provide: CLOCK,
      useValue: { now: (): string => new Date().toISOString() } satisfies Clock,
    },
    {
      provide: SOURCE_REGISTER_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresSourceRegisterRepository =>
        new PostgresSourceRegisterRepository(connection),
    },
    {
      provide: EnableSource,
      inject: [SOURCE_REGISTER_REPOSITORY, CLOCK],
      useFactory: (sources: SourceRegisterRepository, clock: Clock): EnableSource =>
        new EnableSource(sources, clock),
    },
  ],
  exports: [EnableSource],
})
export class SourceRegisterCommandModule {}
