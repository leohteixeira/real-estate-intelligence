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
import { GRAPH_CHECKPOINT_PORT, type GraphCheckpointPort } from '@rei/application';
import { parseCheckpointRequest, parseCheckpointResponse } from '@rei/contracts';
import type { Request } from 'express';
import { liveAuthorized, strongAskBearer } from './ask-live.controller';
import { askRequestWork } from './ask-request-signal';
import { readQuery } from '../http/read-query';
@Controller('ask/runs/:id/checkpoints')
export class GraphCheckpointController {
  public constructor(
    @Inject(GRAPH_CHECKPOINT_PORT) private readonly checkpoints: GraphCheckpointPort,
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
      input = parseCheckpointRequest(body);
      if (input.runId !== id) throw new Error();
    } catch {
      throw new BadRequestException();
    }
    return parseCheckpointResponse(
      await askRequestWork(request, (signal) =>
        liveAuthorized(() => this.checkpoints.execute(input, grant, signal)),
      ),
    );
  }
}
