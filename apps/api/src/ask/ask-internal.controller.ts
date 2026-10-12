import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { MODEL_EXPLANATION_REPOSITORY, type ModelExplanationRepository } from '@rei/application';
import { parseModelExplanationRequest, parseModelExplanationResponse } from '@rei/contracts';
import type { Request } from 'express';
import { liveAuthorized, strongAskBearer } from './ask-live.controller';
import { askRequestWork } from './ask-request-signal';
import { readQuery } from '../http/read-query';

/** Claim-scoped model persistence, authorized by the fresh checkpoint grant. */
@Controller('internal/ask/runs/:id/model-explanation')
export class AskInternalController {
  public constructor(
    @Inject(MODEL_EXPLANATION_REPOSITORY) private readonly explanations: ModelExplanationRepository,
  ) {}
  @Post()
  @HttpCode(200)
  public async execute(@Param('id') id: string, @Body() body: unknown, @Req() request: Request) {
    readQuery(request, 'none');
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''))
      throw new UnsupportedMediaTypeException();
    const grant = strongAskBearer(request.headers.authorization);
    let input;
    try {
      input = parseModelExplanationRequest(body);
      if (input.runId !== id) throw new Error();
    } catch {
      throw new BadRequestException();
    }
    return parseModelExplanationResponse(
      await askRequestWork(request, (signal) =>
        liveAuthorized(() => this.explanations.execute(input, grant, signal)),
      ),
    );
  }
}
