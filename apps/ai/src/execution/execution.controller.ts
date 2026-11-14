import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { parseRunExecutionRequest } from '@rei/contracts';
import { askExecutionBudget } from '@rei/domain';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ExecutionService } from './execution.service';
import { readConfig } from '../config';

@Controller('internal/v1/runs')
export class ExecutionController {
  public constructor(private readonly service: ExecutionService) {}
  @Post('execute')
  @HttpCode(200)
  public async execute(
    @Body() body: unknown,
    @Req() request: IncomingMessage,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''))
      throw new UnsupportedMediaTypeException();
    let input;
    try {
      input = parseRunExecutionRequest(body);
    } catch {
      throw new BadRequestException();
    }
    const disconnected = new AbortController();
    const abort = () => {
      if (!response.writableEnded) disconnected.abort();
    };
    request.once('aborted', abort);
    response.once('close', abort);
    try {
      return await this.service.execute(
        input,
        AbortSignal.any([
          disconnected.signal,
          AbortSignal.timeout(
            input.step !== 'foundation'
              ? (readConfig(process.env).tracerDeadlineMs ?? askExecutionBudget.graphDeadlineMs)
              : 2000,
          ),
        ]),
      );
    } finally {
      request.removeListener('aborted', abort);
      response.removeListener('close', abort);
    }
  }
}
