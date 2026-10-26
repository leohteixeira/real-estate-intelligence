import '../../apps/ai/node_modules/reflect-metadata/Reflect.js';
import { Test } from '../../apps/ai/node_modules/@nestjs/testing/index.js';
import type { NestExpressApplication } from '../../apps/ai/node_modules/@nestjs/platform-express/index.js';
import { createGateway } from '../../apps/ai/node_modules/@ai-sdk/gateway/dist/index.js';
import { experimental_decide as decide } from '../../apps/ai/node_modules/ai/dist/index.js';
import { AppModule } from '../../apps/ai/dist/app.module.js';
import { INTENT_DECIDER, GatewayIntentDecider } from '../../apps/ai/dist/models/intent-decider.js';
import {
  LANGUAGE_MODEL,
  type LanguageModel,
} from '../../apps/ai/dist/models/language-model.port.js';
import { askIntents } from '../../packages/contracts/dist/index.js';
import { configureExecutionHttp } from '../../apps/ai/dist/execution/execution.http.js';
import { readConfig } from '../../apps/ai/dist/config.js';
const attempts = { decisionProbes: 0, decisions: 0, probes: 0, generations: 0 };
const metadata = {
  gateway: {
    routing: {
      planningReasoning:
        'ZDR requested: 1 attempts → 1 ZDR attempts. ZDR execution order: anthropic(system)',
    },
  },
  fixturePrivateMetadata: { text: 'rei-private-provider-response-sentinel' },
};
const decider = new GatewayIntentDecider('rei-private-provider-key-sentinel', decide, (options) =>
  createGateway({
    ...options,
    fetch: async (_url, init) => {
      const body: unknown = JSON.parse(String(init?.body));
      if (
        typeof body !== 'object' ||
        body === null ||
        !('state' in body) ||
        typeof body.state !== 'string'
      )
        throw new Error('Invalid fixture request.');
      const probe = body.state.startsWith('Public privacy capability probe:');
      if (probe) attempts.decisionProbes++;
      else attempts.decisions++;
      const intent = body.state.includes('listing search')
        ? 'listing_search'
        : 'price_per_square_meter';
      const probability = body.state.includes('uncertain') ? 0.84 : 0.85;
      return Response.json({
        answers: {
          intent: {
            type: 'choice',
            choice: intent,
            probabilities: Object.fromEntries(
              askIntents.map((label) => [
                label,
                label === intent ? probability : (1 - probability) / 5,
              ]),
            ),
          },
        },
        providerMetadata: metadata,
        warnings: [],
      });
    },
  }),
);
const scripted: LanguageModel = {
  async generate(request, signal) {
    signal.throwIfAborted();
    const probe = request.prompt === 'Return the single public word: ready.';
    if (probe) attempts.probes++;
    else attempts.generations++;
    return {
      text: probe ? 'ready' : request.prompt.split('\n').slice(-3).reverse().join(' '),
      outputTokens: probe ? 1 : 64,
      model: request.model,
      route: request.route,
      warnings: [],
      metadata,
    };
  },
};
const config = readConfig(process.env);
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(INTENT_DECIDER)
  .useValue(decider)
  .overrideProvider(LANGUAGE_MODEL)
  .useValue(scripted)
  .compile();
const app = module.createNestApplication<NestExpressApplication>({
  bodyParser: false,
  logger: false,
});
configureExecutionHttp(app, config.internalToken);
app
  .getHttpAdapter()
  .get('/fixture/attempts', (_request: unknown, response: { json(body: typeof attempts): void }) =>
    response.json(attempts),
  );
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
