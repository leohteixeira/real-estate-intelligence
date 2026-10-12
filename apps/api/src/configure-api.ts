import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@rei/contracts';
import { json } from 'express';

import { ApiExceptionFilter } from './http/api-exception.filter';
import { requestIdMiddleware } from './http/request-id';

/** Applies the HTTP contract shared by production and request-path tests. */
export function configureApi(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.use(/^\/api\/v1\/ask\/runs\/[0-9a-f-]{36}\/checkpoints\/?$/, json({ limit: 786432 }));
  // Nest recognizes any registered jsonParser by name, including the scoped one above.
  // Register its unchanged default explicitly so every other route retains 100 KiB.
  app.use(json({ limit: 102400 }));
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'ready'] });
  app.useGlobalFilters(new ApiExceptionFilter());
}
