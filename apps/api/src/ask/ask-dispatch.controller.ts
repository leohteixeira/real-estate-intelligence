import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ASK_LIVE_FACADE, type AskLiveFacade } from '@rei/application';
import {
  parseAskClaim,
  parseAskCompletion,
  parseAskLiveRun,
  parseAskRequestedIdentity,
} from '@rei/contracts';
import type { AskRequestedIdentity } from '@rei/domain';
import { askDispatchProof, equalAskDigest } from '@rei/infrastructure';
import type { Request } from 'express';
import { readAskConfig } from './ask.config';
import { liveAuthorized } from './ask-live.controller';
import { askRequestWork } from './ask-request-signal';
@Controller('internal/ask/runs/:id')
export class AskDispatchController {
  public constructor(@Inject(ASK_LIVE_FACADE) private readonly live: AskLiveFacade) {}
  private authorize(id: string, identity: AskRequestedIdentity, request: Request): void {
    const secret = readAskConfig(process.env).secret;
    if (!secret) throw new ServiceUnavailableException();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header))
      throw new UnauthorizedException();
    if (
      id !== identity.runId ||
      !equalAskDigest(header.slice(7), askDispatchProof(secret, identity))
    )
      throw new ForbiddenException();
  }
  @Post('claim')
  @HttpCode(200)
  public async claim(@Param('id') id: string, @Body() body: unknown, @Req() request: Request) {
    let identity;
    try {
      identity = parseAskRequestedIdentity(body);
    } catch {
      throw new BadRequestException();
    }
    this.authorize(id, identity, request);
    return parseAskClaim(
      await askRequestWork(request, (signal) =>
        liveAuthorized(() => this.live.claim(identity, signal)),
      ),
    );
  }
  @Post('complete')
  @HttpCode(200)
  public async complete(@Param('id') id: string, @Body() body: unknown, @Req() request: Request) {
    let input;
    try {
      input = parseAskCompletion(body);
    } catch {
      throw new BadRequestException();
    }
    this.authorize(id, input, request);
    return parseAskLiveRun(
      await askRequestWork(request, (signal) =>
        liveAuthorized(() => this.live.complete(input, signal)),
      ),
    );
  }
}
