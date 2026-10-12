import { Module } from '@nestjs/common';

import { NO_OP_GRAPH, noOpGraphProvider } from './no-op.graph';
import { PRICE_GRAPH } from './price-per-square-meter.graph';
import { PriceGraphFactory } from './price-graph.factory';
import { HttpGraphCheckpointAdapter } from './http-graph-checkpoint.adapter';
import { ResilientGraphCheckpointAdapter } from './resilient-graph-checkpoint.adapter';
import { GraphCheckpointFailure } from './graph-checkpoint.port';
import { readConfig } from '../config';
import { PRICE_TOOL, type PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [ToolsModule],
  providers: [
    noOpGraphProvider,
    {
      provide: PRICE_GRAPH,
      inject: [PRICE_TOOL],
      useFactory: (tool: PricePerSquareMeterTool) => {
        const origin = readConfig(process.env).apiBaseUrl;
        return new PriceGraphFactory(
          tool,
          origin
            ? new ResilientGraphCheckpointAdapter(new HttpGraphCheckpointAdapter(origin))
            : { execute: () => Promise.reject(new GraphCheckpointFailure('rejected')) },
        );
      },
    },
  ],
  exports: [NO_OP_GRAPH, PRICE_GRAPH],
})
export class GraphModule {}
