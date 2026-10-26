import '../../apps/api/node_modules/reflect-metadata/Reflect.js';
import { Test } from '../../apps/api/node_modules/@nestjs/testing/index.js';
import { createRequire } from 'node:module';
import type { INestApplication, Type } from '../../apps/api/node_modules/@nestjs/common/index.js';
// API emits CommonJS without declarations; these are the consumed production export signatures.
const require = createRequire(import.meta.url);
const { AppModule } = require('../../apps/api/dist/app.module.js') as { AppModule: Type<unknown> };
const { configureApi } = require('../../apps/api/dist/configure-api.js') as {
  configureApi(app: INestApplication): void;
};
const { readConfig } = require('../../apps/api/dist/config.js') as {
  readConfig(environment: NodeJS.ProcessEnv): { port: number };
};
import { PROPERTY_SEARCH } from '../../packages/application/dist/index.js';
import { SyntheticPropertiesAdapter } from '../../packages/infrastructure/dist/index.js';
import type { SearchQuery } from '../../packages/domain/dist/index.js';

/** Owned test startup only. All other providers remain the actual production composition. */
const prepared = new SyntheticPropertiesAdapter();
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(PROPERTY_SEARCH)
  .useValue({ execute: (query: SearchQuery) => prepared.search(query) })
  .compile();
const app = module.createNestApplication();
configureApi(app);
app.enableShutdownHooks();
await app.listen(readConfig(process.env).port, '0.0.0.0');
