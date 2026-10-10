import { END, START, StateGraph } from '@langchain/langgraph';
import type { Provider } from '@nestjs/common';
import { z } from 'zod';

const NoOpState = z.object({});

export const NO_OP_GRAPH = Symbol('NO_OP_GRAPH');

/**
 * The initial graph is deliberately inert. It creates the LangGraph and Nest
 * dependency-injection seam without agents, models, tools or external I/O.
 */
export function compileNoOpGraph() {
  return new StateGraph(NoOpState)
    .addNode('noOp', () => ({}))
    .addEdge(START, 'noOp')
    .addEdge('noOp', END)
    .compile();
}

export type NoOpGraph = ReturnType<typeof compileNoOpGraph>;

export const noOpGraphProvider: Provider = {
  provide: NO_OP_GRAPH,
  useFactory: compileNoOpGraph,
};
