import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ASK_LIVE_FACADE, AskLiveError, type AskLiveFacade } from '@rei/application';
import { parseAskCommandHeaders, parseStructuredAskCreate } from '@rei/contracts';
import type { Request } from 'express';
import { DomainValidationError } from '@rei/domain';
import { askBearerCapability } from './ask.controller';
import { readAskConfig } from './ask.config';
import { askRequestWork } from './ask-request-signal';
import { readQuery } from '../http/read-query';
export function strongAskBearer(header: unknown): string {
  const capability = askBearerCapability(header);
  if (capability.length < 43) throw new UnauthorizedException();
  return capability;
}
export async function liveAuthorized<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof AskLiveError) {
      if (error.kind === 'forbidden') throw new ForbiddenException();
      if (error.kind === 'conflict') throw new ConflictException();
      if (error.kind === 'invalid') throw new BadRequestException();
      throw new ServiceUnavailableException();
    }
    if (error instanceof TypeError || error instanceof DomainValidationError)
      throw new BadRequestException();
    throw error;
  }
}
@Controller()
export class AskLiveController {
  public constructor(@Inject(ASK_LIVE_FACADE) private readonly live: AskLiveFacade) {}
  @Get('ask/structured-capabilities')
  public capabilities(@Req() request: Request) {
    readQuery(request, 'none');
    return {
      mode: 'structured-price-v1',
      available: !!readAskConfig(process.env).secret,
      intent: 'price_per_square_meter',
    };
  }
  @Post('runs')
  @HttpCode(202)
  public async create(@Body() body: unknown, @Req() request: Request) {
    readQuery(request, 'none');
    const capability = strongAskBearer(request.headers.authorization);
    if (!readAskConfig(process.env).secret) throw new ServiceUnavailableException();
    let input;
    let key;
    try {
      input = parseStructuredAskCreate(body);
      key = parseAskCommandHeaders({
        idempotencyKey: request.headers['idempotency-key'],
      }).idempotencyKey;
    } catch {
      throw new BadRequestException();
    }
    const run = await askRequestWork(request, (signal) =>
      liveAuthorized(() => this.live.create(input, capability, key, signal)),
    );
    return { mode: 'structured-price-v1', runId: run.id, threadId: run.threadId, state: 'queued' };
  }
}
