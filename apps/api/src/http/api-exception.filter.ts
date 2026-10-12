import { randomUUID } from 'node:crypto';

import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import type { ErrorResponse } from '@rei/contracts';
import type { Request, Response } from 'express';

import { getRequestId, REQUEST_ID_HEADER } from './request-id';
import { AskPendingLimitException } from './ask-pending-limit.exception';

interface PublicError {
  readonly code: string;
  readonly message: string;
}

const PUBLIC_ERRORS: Readonly<Record<number, PublicError>> = {
  [HttpStatus.BAD_REQUEST]: {
    code: 'bad_request',
    message: 'The request could not be processed.',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: 'unauthorized',
    message: 'Authentication is required.',
  },
  [HttpStatus.FORBIDDEN]: {
    code: 'forbidden',
    message: 'The requested operation is not permitted.',
  },
  [HttpStatus.NOT_FOUND]: {
    code: 'not_found',
    message: 'The requested resource was not found.',
  },
  [HttpStatus.METHOD_NOT_ALLOWED]: {
    code: 'method_not_allowed',
    message: 'The request method is not allowed.',
  },
  [HttpStatus.CONFLICT]: {
    code: 'conflict',
    message: 'The request conflicts with the current resource state.',
  },
  [HttpStatus.PAYLOAD_TOO_LARGE]: {
    code: 'payload_too_large',
    message: 'The request payload is too large.',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: 'unsupported_media_type',
    message: 'The request media type is not supported.',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'unprocessable_entity',
    message: 'The request could not be processed.',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: {
    code: 'too_many_requests',
    message: 'Too many requests were made.',
  },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'service_unavailable',
    message: 'The service is temporarily unavailable.',
  },
};

const CLIENT_ERROR: PublicError = {
  code: 'client_error',
  message: 'The request could not be processed.',
};

const INTERNAL_ERROR: PublicError = {
  code: 'internal_error',
  message: 'An unexpected error occurred.',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response =
      http.getResponse<Response<ErrorResponse | AskPendingLimitException['refusal']>>();
    const exceptionStatus = getExceptionStatus(exception);
    const status = isHttpErrorStatus(exceptionStatus)
      ? exceptionStatus
      : HttpStatus.INTERNAL_SERVER_ERROR;
    const publicError =
      PUBLIC_ERRORS[status] ??
      (status >= HttpStatus.BAD_REQUEST && status < HttpStatus.INTERNAL_SERVER_ERROR
        ? CLIENT_ERROR
        : INTERNAL_ERROR);
    const requestId = getRequestId(request) ?? randomUUID();

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ event: 'api.unexpected_failure', requestId });
    }

    response.setHeader(REQUEST_ID_HEADER, requestId);
    if (exception instanceof AskPendingLimitException) {
      response.status(status).json(exception.refusal);
      return;
    }
    response.status(status).json({
      error: {
        ...publicError,
        requestId,
      },
    });
  }
}

function isHttpErrorStatus(status: number | undefined): status is number {
  return status !== undefined && Number.isInteger(status) && status >= 400 && status <= 599;
}

function getExceptionStatus(exception: unknown): number | undefined {
  if (exception instanceof HttpException) {
    return exception.getStatus();
  }

  if (typeof exception !== 'object' || exception === null || !('message' in exception)) {
    return undefined;
  }

  if (typeof exception.message !== 'string') {
    return undefined;
  }

  const status = 'status' in exception ? exception.status : undefined;
  const statusCode = 'statusCode' in exception ? exception.statusCode : undefined;

  if (status !== undefined && !isHttpErrorStatusValue(status)) {
    return undefined;
  }

  if (statusCode !== undefined && !isHttpErrorStatusValue(statusCode)) {
    return undefined;
  }

  if (status !== undefined && statusCode !== undefined && status !== statusCode) {
    return undefined;
  }

  return statusCode ?? status;
}

function isHttpErrorStatusValue(status: unknown): status is number {
  return typeof status === 'number' && isHttpErrorStatus(status);
}
