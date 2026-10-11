import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ASK_FACADE, AskQueryService } from '@rei/application';
import { SyntheticAskAdapter } from '@rei/infrastructure';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';
import { AskController } from './ask.controller';

@Module({
  controllers: [AskController],
  providers: [
    { provide: ASK_FACADE, useFactory: () => new AskQueryService(new SyntheticAskAdapter()) },
  ],
  exports: [ASK_FACADE],
})
export class AskModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['ask', 'threads', 'runs']);
  }
}
