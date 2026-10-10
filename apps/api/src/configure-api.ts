import type { INestApplication } from '@nestjs/common';
import { API_PREFIX } from '@rei/contracts';

import { ApiExceptionFilter } from './http/api-exception.filter';
import { requestIdMiddleware } from './http/request-id';

/** Applies the HTTP contract shared by production and request-path tests. */
export function configureApi(app: INestApplication): void {
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'ready'] });
  app.useGlobalFilters(new ApiExceptionFilter());
}
