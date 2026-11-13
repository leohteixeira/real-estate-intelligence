import '../../apps/ai/node_modules/reflect-metadata/Reflect.js';
import { Test } from '../../apps/ai/node_modules/@nestjs/testing/index.js';
import type { NestExpressApplication } from '../../apps/ai/node_modules/@nestjs/platform-express/index.js';
import { AppModule } from '../../apps/ai/dist/app.module.js';
import {
  INTENT_DECIDER,
  AnthropicIntentDecider,
  type IntentDecider,
} from '../../apps/ai/dist/models/intent-decider.js';
import {
  LANGUAGE_MODEL,
  type LanguageModel,
} from '../../apps/ai/dist/models/language-model.port.js';
import { askIntents, parseIntentDecision } from '../../packages/contracts/dist/index.js';
import { configureExecutionHttp } from '../../apps/ai/dist/execution/execution.http.js';
import { readConfig } from '../../apps/ai/dist/config.js';
const attempts = { decisions: 0, generations: 0 };
// The real adapter and the real pinned SDK; only the SDK's documented fetch option is replaced.
const provider = new AnthropicIntentDecider(
  'rei-private-provider-key-sentinel',
  async (_url, init) => {
    const body: unknown = JSON.parse(String(init?.body));
    const message =
      typeof body === 'object' &&
      body !== null &&
      'messages' in body &&
      Array.isArray(body.messages)
        ? (body.messages as unknown[])[0]
        : undefined;
    if (
      typeof message !== 'object' ||
      message === null ||
      !('content' in message) ||
      typeof message.content !== 'string'
    )
      throw new Error('Invalid fixture request.');
    attempts.decisions++;
    const intent = message.content.includes('listing search')
      ? 'listing_search'
      : 'price_per_square_meter';
    const probability = message.content.includes('uncertain') ? 0.84 : 0.85;
    return Response.json({
      id: 'msg_trace_fixture',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: JSON.stringify({ intent, probability }) }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 320, output_tokens: 18 },
      fixturePrivateMetadata: { text: 'rei-private-provider-response-sentinel' },
    });
  },
);
// A run paused before the provider change keeps its gateway-era decision. The marker lets the
// upgrade test store such a decision through the real API before the direct-provider migration.
const decider: IntentDecider = {
  async decide(query, locale, signal, deadlineAt) {
    if (!query.includes('rei-historical-gateway-decision'))
      return provider.decide(query, locale, signal, deadlineAt);
    signal.throwIfAborted();
    return parseIntentDecision({
      intent: 'price_per_square_meter',
      probability: 0.84,
      probabilities: Object.fromEntries(
        askIntents.map((label) => [label, label === 'price_per_square_meter' ? 0.84 : 0.032]),
      ),
      source: 'gateway-jev-v1',
      degraded: false,
      taxonomyVersion: 'ask-intents-v1',
      privacyEvidenceId: 'historical-gateway-evidence-0001',
    });
  },
};
const scripted: LanguageModel = {
  async generate(request, signal) {
    signal.throwIfAborted();
    attempts.generations++;
    return {
      text: request.prompt.split('\n').slice(-3).reverse().join(' '),
      outputTokens: 64,
      model: request.model,
      route: request.route,
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
