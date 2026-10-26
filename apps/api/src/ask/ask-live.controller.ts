import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Param,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ASK_LIVE_FACADE, AskLiveError, type AskLiveFacade } from '@rei/application';
import {
  parseAskCommandHeaders,
  parseRoutedAskCreate,
  parseRoutedExplainedAskCreate,
  parseRoutedExplainedAskAccepted,
  parseRoutedAskAccepted,
  parseRoutedAskConfirmation,
  parseAskCancelRequest,
  parseAskLiveRun,
  parseStructuredAskCreate,
  parseTextAskCreate,
  parseTextAskRefused,
  parseExplainedAskCreate,
} from '@rei/contracts';
import type { Request, Response } from 'express';
import { DomainValidationError } from '@rei/domain';
import { askBearerCapability } from './ask.controller';
import { readAskConfig } from './ask.config';
import { askRequestWork } from './ask-request-signal';
import { readQuery } from '../http/read-query';
import { AskPendingLimitException } from '../http/ask-pending-limit.exception';
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
      if (error.kind === 'capacity') throw new AskPendingLimitException();
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
  @Get('ask/text-price-capabilities')
  public textCapabilities(@Req() request: Request) {
    readQuery(request, 'none');
    return {
      mode: 'text-price-v1',
      available: !!readAskConfig(process.env).secret,
      intent: 'price_per_square_meter',
    };
  }
  @Get('ask/text-price-explanation-capabilities')
  public explanationCapabilities(@Req() request: Request) {
    readQuery(request, 'none');
    return {
      mode: 'text-price-explanation-v1',
      available: !!readAskConfig(process.env).secret,
      intent: 'price_per_square_meter',
    };
  }
  @Post('runs/:id/confirm')
  @HttpCode(200)
  public async confirm(@Param('id') id: string, @Body() body: unknown, @Req() request: Request) {
    readQuery(request, 'none');
    const capability = strongAskBearer(request.headers.authorization);
    return askRequestWork(request, (signal) =>
      liveAuthorized(async () => {
        const input = parseRoutedAskConfirmation(body);
        if (input.runId !== id) throw new BadRequestException();
        return parseAskLiveRun(await this.live.confirm(input, capability, signal));
      }),
    );
  }
  @Post('runs/:id/cancel')
  @HttpCode(200)
  public async cancel(@Param('id') id: string, @Body() body: unknown, @Req() request: Request) {
    readQuery(request, 'none');
    const capability = strongAskBearer(request.headers.authorization);
    return askRequestWork(request, (signal) =>
      liveAuthorized(async () => {
        parseAskCancelRequest(body);
        return parseAskLiveRun(await this.live.cancel(id, capability, signal));
      }),
    );
  }
  @Post('runs')
  @HttpCode(202)
  public async create(
    @Body() body: unknown,
    @Req() request: Request,
    @Res({ passthrough: true }) response?: Response,
  ) {
    readQuery(request, 'none');
    const capability = strongAskBearer(request.headers.authorization);
    if (!readAskConfig(process.env).secret) throw new ServiceUnavailableException();
    let input;
    let key;
    try {
      const mode = typeof body === 'object' && body !== null && 'mode' in body ? body.mode : null;
      input =
        mode === 'routed-text-explanation-v1'
          ? parseRoutedExplainedAskCreate(body)
          : mode === 'routed-text-v1'
            ? parseRoutedAskCreate(body)
            : mode === 'text-price-explanation-v1'
              ? parseExplainedAskCreate(body)
              : mode === 'text-price-v1'
                ? parseTextAskCreate(body)
                : parseStructuredAskCreate(body);
      key = parseAskCommandHeaders({
        idempotencyKey: request.headers['idempotency-key'],
      }).idempotencyKey;
    } catch {
      throw new BadRequestException();
    }
    if (input.mode === 'routed-text-v1' || input.mode === 'routed-text-explanation-v1') {
      const run = await askRequestWork(request, (signal) =>
        liveAuthorized(() => this.live.createRouted(input, capability, key, signal)),
      );
      return (
        input.mode === 'routed-text-explanation-v1'
          ? parseRoutedExplainedAskAccepted
          : parseRoutedAskAccepted
      )({
        mode: input.mode,
        runId: run.id,
        threadId: run.threadId,
        state: 'queued',
      });
    }
    if (input.mode !== 'structured-price-v1') {
      const result = await askRequestWork(request, (signal) =>
        liveAuthorized(() => this.live.createText(input, capability, key, signal)),
      );
      if (result.kind === 'refused') {
        response?.status(422);
        const refusal = parseTextAskRefused({
          mode: 'text-price-v1',
          code: 'price_input_refused',
          reason: result.reason,
        });
        return { ...refusal, mode: input.mode };
      }
      return {
        mode: input.mode,
        runId: result.run.id,
        threadId: result.run.threadId,
        state: 'queued',
      };
    }
    const run = await askRequestWork(request, (signal) =>
      liveAuthorized(() => this.live.create(input, capability, key, signal)),
    );
    return { mode: input.mode, runId: run.id, threadId: run.threadId, state: 'queued' };
  }
}
