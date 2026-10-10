import { NotFoundException } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { NextFunction, Request, Response } from 'express';
import { ApiExceptionFilter } from './api-exception.filter';

/** Nest's unmatched Express routes bypass global filters; preserve JSON for these read families. */
export function rejectUnprefixedReadPaths(
  adapter: HttpAdapterHost,
  roots: readonly string[],
): void {
  const filter = new ApiExceptionFilter();
  adapter.httpAdapter.use((request: Request, response: Response, next: NextFunction): void => {
    const path = new URL(request.originalUrl, 'http://localhost').pathname;
    if (roots.some((root) => path === `/${root}` || path.startsWith(`/${root}/`))) {
      filter.catch(new NotFoundException(), new ExecutionContextHost([request, response, next]));
      return;
    }
    next();
  });
}
