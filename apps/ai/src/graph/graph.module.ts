import { Module } from '@nestjs/common';

import { NO_OP_GRAPH, noOpGraphProvider } from './no-op.graph';
import { compilePriceGraph, PRICE_GRAPH } from './price-per-square-meter.graph';
import { PRICE_TOOL, type PricePerSquareMeterTool } from '../tools/price-per-square-meter.port';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [ToolsModule],
  providers: [
    noOpGraphProvider,
    {
      provide: PRICE_GRAPH,
      inject: [PRICE_TOOL],
      useFactory: (tool: PricePerSquareMeterTool) => compilePriceGraph(tool),
    },
  ],
  exports: [NO_OP_GRAPH, PRICE_GRAPH],
})
export class GraphModule {}
