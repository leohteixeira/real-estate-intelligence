import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { authorizeExecution } from './execution.authorization';

export const EXECUTION_REQUEST_BYTES = 100_000;
type JsonResponse = ServerResponse & {
  status(code: number): JsonResponse;
  json(body: object): void;
};
const categories: Readonly<Record<number, string>> = {
  400: 'bad_request',
  401: 'unauthorized',
  413: 'bad_request',
  415: 'unsupported_media_type',
  503: 'unavailable',
};

@Catch()
export class ExecutionExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : exception instanceof Error && 'type' in exception
          ? exception.type === 'entity.too.large'
            ? 413
            : exception.type === 'charset.unsupported' || exception.type === 'encoding.unsupported'
              ? 415
              : 503
          : 503;
    response
      .status(categories[status] ? status : 503)
      .json({ code: categories[status] ?? 'unavailable' });
  }
}

/** Called before registering JSON middleware: authority is checked before parsing private input. */
export function configureExecutionHttp(
  app: NestExpressApplication,
  token: string | undefined,
): void {
  app.use(
    '/internal/v1/runs/execute',
    (request: IncomingMessage, response: JsonResponse, next: () => void) => {
      const status = authorizeExecution(token, request.headers.authorization);
      if (status !== 200) {
        response.status(status).json({ code: categories[status] });
        return;
      }
      next();
    },
  );
  app.useBodyParser('json', { limit: EXECUTION_REQUEST_BYTES });
  app.useGlobalFilters(new ExecutionExceptionFilter());
}
