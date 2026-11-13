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
    'refusal',
    'retry',
    'authentication',
    'usage',
    'cancelled',
    'wait-generation',
  ].includes(scenario)
)
  throw new Error('An explicit model fixture scenario is required.');
const attempts = { generations: 0 };
const scripted: LanguageModel = {
  async generate(request: LanguageModelRequest, signal: AbortSignal) {
    attempts.generations++;
    if (signal.aborted || scenario === 'cancelled') throw new ModelExplanationFailure('cancelled');
    if (scenario === 'authentication') throw new ModelExplanationFailure('authentication');
    // The provider declining the request is definitive: no retry and no other model.
    if (scenario === 'refusal') throw new ModelExplanationFailure('policy');
    if (scenario === 'retry' && attempts.generations % 2 === 1)
      throw new ModelExplanationFailure('transient');
    if (scenario === 'wait-generation') {
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(new ModelExplanationFailure('cancelled'));
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    }
    const sentences = request.prompt.split('\n').slice(-3);
    return {
      text:
        scenario === 'invented'
          ? sentences.reverse().join(' ').replace(/68/g, '69')
          : sentences.reverse().join(' '),
      outputTokens: scenario === 'usage' ? undefined : 64,
      model: request.model,
      route: request.route,
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
