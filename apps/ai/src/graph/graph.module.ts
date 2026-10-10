import { Module } from '@nestjs/common';

import { NO_OP_GRAPH, noOpGraphProvider } from './no-op.graph';

@Module({
  providers: [noOpGraphProvider],
  exports: [NO_OP_GRAPH],
})
export class GraphModule {}
