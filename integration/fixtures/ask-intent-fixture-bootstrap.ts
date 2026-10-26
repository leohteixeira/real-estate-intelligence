import '../../apps/ai/node_modules/reflect-metadata/Reflect.js';
import { Test } from '../../apps/ai/node_modules/@nestjs/testing/index.js';
import type { NestExpressApplication } from '../../apps/ai/node_modules/@nestjs/platform-express/index.js';
import { AppModule } from '../../apps/ai/dist/app.module.js';
import {
  INTENT_DECIDER,
  heuristicDecision,
  type IntentDecider,
  DegradedIntentDecider,
} from '../../apps/ai/dist/models/intent-decider.js';
import { ModelExplanationFailure } from '../../apps/ai/dist/models/language-model.port.js';
import { parseIntentDecision, askIntents } from '../../packages/contracts/dist/index.js';
import { configureExecutionHttp } from '../../apps/ai/dist/execution/execution.http.js';
import { readConfig } from '../../apps/ai/dist/config.js';
let decisions = 0;
const scripted: IntentDecider = {
  async decide(query, locale, signal, deadlineAt) {
    signal.throwIfAborted();
    decisions++;
    if (query.includes('degraded'))
      return new DegradedIntentDecider({
        decide: () => Promise.reject(new ModelExplanationFailure('policy')),
      }).decide(query, locale, signal, deadlineAt);
    if (query.includes('malformed')) return { ...heuristicDecision(query), probability: NaN };
    const intent =
      askIntents.find(
        (label) => label !== 'price_per_square_meter' && query.includes(label.replaceAll('_', ' ')),
      ) ?? 'price_per_square_meter';
    const probability = query.includes('uncertain') ? 0.84 : 0.85;
    return parseIntentDecision({
      ...heuristicDecision(query),
      intent,
      probability,
      probabilities: Object.fromEntries(
        askIntents.map((label) => [label, label === intent ? probability : (1 - probability) / 5]),
      ),
    });
  },
};
const config = readConfig(process.env);
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(INTENT_DECIDER)
  .useValue(scripted)
  .compile();
const app = module.createNestApplication<NestExpressApplication>({
  bodyParser: false,
  logger: false,
});
configureExecutionHttp(app, config.internalToken);
app
  .getHttpAdapter()
  .get(
    '/fixture/decisions',
    (_request: unknown, response: { json(body: { decisions: number }): void }) =>
      response.json({ decisions }),
  );
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
