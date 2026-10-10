import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const requestIdKey = Symbol('requestId');

type RequestWithId = Request & {
  [requestIdKey]?: string;
};

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = randomUUID();
  request.headers[REQUEST_ID_HEADER.toLowerCase()] = requestId;
  (request as RequestWithId)[requestIdKey] = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(request: Request): string | undefined {
  return (request as RequestWithId)[requestIdKey];
}
