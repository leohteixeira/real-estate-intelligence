import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { GraphModule } from './graph.module';
import { NO_OP_GRAPH, type NoOpGraph } from './no-op.graph';

describe('no-op graph', () => {
  it('is available through Nest dependency injection', async () => {
    const module = await Test.createTestingModule({ imports: [GraphModule] }).compile();

    expect(module.get<NoOpGraph>(NO_OP_GRAPH)).toBeDefined();
  });

  it('terminates for empty state without producing output', async () => {
    const module = await Test.createTestingModule({ imports: [GraphModule] }).compile();
    const graph = module.get<NoOpGraph>(NO_OP_GRAPH);

    await expect(graph.invoke({})).resolves.toBeUndefined();
  });
});
