import '../../apps/ai/node_modules/reflect-metadata/Reflect.js';
import { Test } from '../../apps/ai/node_modules/@nestjs/testing/index.js';
import type { NestExpressApplication } from '../../apps/ai/node_modules/@nestjs/platform-express/index.js';
import { AppModule } from '../../apps/ai/dist/app.module.js';
import {
  LANGUAGE_MODEL,
  ModelExplanationFailure,
} from '../../apps/ai/dist/models/language-model.port.js';
import type {
  LanguageModel,
  LanguageModelRequest,
} from '../../apps/ai/dist/models/language-model.port.js';
import { configureExecutionHttp } from '../../apps/ai/dist/execution/execution.http.js';
import { readConfig } from '../../apps/ai/dist/config.js';

/** Explicit test bootstrap, mounted only by owned tests; production startup has no fake selector. */
const scenario = process.argv[2];
if (
  !scenario ||
  ![
    'approved',
    'invented',
    'privacy',
    'fallback',
    'authentication',
    'usage',
    'cancelled',
    'wait-generation',
  ].includes(scenario)
)
  throw new Error('An explicit model fixture scenario is required.');
const attempts = { probes: 0, generations: 0 };
const scripted: LanguageModel = {
  async generate(request: LanguageModelRequest, signal: AbortSignal) {
    const probe = request.prompt === 'Return the single public word: ready.';
    if (probe) attempts.probes++;
    else attempts.generations++;
    if (signal.aborted || scenario === 'cancelled') throw new ModelExplanationFailure('cancelled');
    if (scenario === 'authentication') throw new ModelExplanationFailure('authentication');
    if (scenario === 'fallback' && request.model.startsWith('anthropic/'))
      throw new ModelExplanationFailure('transient');
    if (!probe && scenario === 'wait-generation') {
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new ModelExplanationFailure('cancelled'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    }
    const sentences = request.prompt.split('\n').slice(-3);
    const provider = request.model.startsWith('anthropic/') ? 'anthropic' : 'deepseek';
    return {
      text: probe
        ? 'ready'
        : scenario === 'invented'
          ? sentences.reverse().join(' ').replace(/68/g, '69')
          : sentences.reverse().join(' '),
      outputTokens: scenario === 'usage' ? undefined : probe ? 1 : 64,
      model: request.model,
      route: request.route,
      warnings: [],
      metadata:
        scenario === 'privacy'
          ? {}
          : {
              gateway: {
                routing: {
                  planningReasoning: `ZDR requested: 1 attempts → 1 ZDR attempts. ZDR execution order: ${provider}(system)`,
                },
              },
            },
    };
  },
};
const config = readConfig(process.env);
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(LANGUAGE_MODEL)
  .useValue(scripted)
  .compile();
const app = module.createNestApplication<NestExpressApplication>({
  bodyParser: false,
  logger: false,
});
configureExecutionHttp(app, config.internalToken);
// Test-only operational counters prove caller cancellation occurred inside the model port.
app
  .getHttpAdapter()
  .get(
    '/fixture/model-attempts',
    (_request: unknown, response: { json(body: typeof attempts): void }) => response.json(attempts),
  );
app.enableShutdownHooks();
await app.listen(config.port, '0.0.0.0');
