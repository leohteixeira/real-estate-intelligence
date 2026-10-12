import { parseRunExecutionRequest } from '../../packages/contracts/dist/index.js';
import { HttpGraphCheckpointAdapter } from '../../apps/ai/dist/graph/http-graph-checkpoint.adapter.js';
import { HttpPricePerSquareMeterTool } from '../../apps/ai/dist/tools/http-price-per-square-meter.tool.js';
import {
  RemoteCheckpointSaver,
  durablePriceInput,
} from '../../apps/ai/dist/graph/remote-checkpoint-saver.js';
import { compilePriceGraph } from '../../apps/ai/dist/graph/price-per-square-meter.graph.js';
import { PriceGraphFactory } from '../../apps/ai/dist/graph/price-graph.factory.js';
import { compileNoOpGraph } from '../../apps/ai/dist/graph/no-op.graph.js';
import { ExecutionService } from '../../apps/ai/dist/execution/execution.service.js';

const origin = process.env.ASK_CHECKPOINT_FIXTURE_API;
if (!origin) throw new Error('Owned checkpoint fixture configuration is required.');
let text = '';
for await (const chunk of process.stdin) {
  text += String(chunk);
  if (Buffer.byteLength(text) > 131072) throw new Error('Probe input unavailable.');
}
const input = parseRunExecutionRequest(JSON.parse(text));
if (input.step === 'foundation') throw new Error('Price input required.');
const signal = AbortSignal.timeout(15000);
const tool = new HttpPricePerSquareMeterTool(origin);
const remote = new HttpGraphCheckpointAdapter(origin);
if (process.argv[2] === 'pause') {
  const deadlineAt = Date.now() + 10000;
  const saver = new RemoteCheckpointSaver(input, remote, signal, deadlineAt);
  const graph = compilePriceGraph(
    tool,
    { executionId: input.executionId, toolGrant: input.toolGrant, signal, deadlineAt },
    saver,
    ['priceTool'],
  );
  const config = { configurable: { thread_id: input.threadId }, durability: 'sync' as const };
  await graph.invoke({ input: durablePriceInput(input) }, config);
  const state = await graph.getState(config);
  console.log(JSON.stringify({ next: state.next, visitedNodes: state.values.visitedNodes }));
} else {
  const evidence = await new ExecutionService(
    compileNoOpGraph(),
    new PriceGraphFactory(tool, remote),
  ).execute(input, signal);
  console.log(JSON.stringify(evidence));
}
