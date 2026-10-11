import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Req,
  Sse,
  UnauthorizedException,
  type MessageEvent,
} from '@nestjs/common';
import { ASK_FACADE, AskAccessDeniedError, type AskFacade } from '@rei/application';
import {
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseAskProgressEvent,
  parseAskRun,
  parseAskThread,
  type AskProgressEvent,
} from '@rei/contracts';
import { DomainValidationError } from '@rei/domain';
import type { Request } from 'express';
import { catchError, EMPTY, from, map, of, takeWhile, type Observable } from 'rxjs';
import { readQuery } from '../http/read-query';

export function askBearerCapability(header: unknown): string {
  if (
    typeof header !== 'string' ||
    header.trim() !== header ||
    !/^Bearer [a-zA-Z0-9_-]{16,128}$/.test(header)
  )
    throw new UnauthorizedException();
  return header.slice(7);
}
function capability(request: Request): string {
  return askBearerCapability(request.headers.authorization);
}
async function authorized<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    if (error instanceof AskAccessDeniedError) throw new ForbiddenException();
    if (error instanceof DomainValidationError) throw new BadRequestException();
    throw error;
  }
}
function present<T>(value: T | null): T {
  if (value === null) throw new NotFoundException();
  return value;
}
function safeFailure(frame: AskProgressEvent, sequence: number): AskProgressEvent {
  const at = frame.run.updatedAt;
  return parseAskProgressEvent({
    ...frame,
    id: `${frame.runId}:v1:${sequence}`,
    sequence,
    event: 'ask.failed',
    terminal: true,
    run: {
      ...frame.run,
      state: 'failed',
      result: null,
      terminal: { state: 'failed', reason: 'preview_unavailable', at },
      steps: [...frame.run.steps, { sequence: frame.run.steps.length + 1, phase: 'failed', at }],
    },
  });
}
/** Validate the whole finite response before subscription; never expose RxJS error payloads. */
export function askPreviewStream(
  prepared: readonly AskProgressEvent[],
  source?: Observable<AskProgressEvent>,
): Observable<MessageEvent> {
  const frames = prepared.map(parseAskProgressEvent);
  if (!frames.length) return EMPTY;
  const failures = frames.map((frame) =>
    frame.terminal ? null : safeFailure(frame, frame.sequence + 1),
  );
  let lastIndex = 0;
  const fallback = frames[0]!.terminal ? frames[0]! : safeFailure(frames[0]!, frames[0]!.sequence);
  let emitted = false;
  return (source ?? from(frames)).pipe(
    map((frame) => {
      lastIndex = frames.findIndex((item) => item.id === frame.id);
      emitted = true;
      return frame;
    }),
    takeWhile((frame) => !frame.terminal, true),
    catchError(() => of(emitted ? (failures[lastIndex] ?? fallback) : fallback)),
    map((frame) => ({ id: frame.id, type: frame.event, data: frame })),
  );
}

@Controller()
export class AskController {
  public constructor(@Inject(ASK_FACADE) private readonly ask: AskFacade) {}
  @Get('ask/capabilities')
  public async capabilities(@Req() request: Request) {
    readQuery(request, 'none');
    return parseAskAvailability(await this.ask.availability());
  }
  @Get('ask/fixtures')
  public async fixtures(@Req() request: Request) {
    readQuery(request, 'none');
    return parseAskFixtureCatalogue(await this.ask.catalogue());
  }
  @Get('runs/:id')
  public async run(@Param('id') id: string, @Req() request: Request) {
    const grant = capability(request);
    readQuery(request, 'none');
    return parseAskRun(present(await authorized(() => this.ask.run(id, grant))));
  }
  @Get('threads/:id')
  public async thread(@Param('id') id: string, @Req() request: Request) {
    const grant = capability(request);
    readQuery(request, 'none');
    return parseAskThread(present(await authorized(() => this.ask.thread(id, grant))));
  }
  @Sse('runs/:id/events')
  public async events(
    @Param('id') id: string,
    @Req() request: Request,
  ): Promise<Observable<MessageEvent>> {
    const grant = capability(request);
    readQuery(request, 'none');
    const cursor = request.headers['last-event-id'];
    if (cursor !== undefined && typeof cursor !== 'string') throw new BadRequestException();
    const frames = present(await authorized(() => this.ask.preview(id, grant, cursor)));
    return askPreviewStream(frames);
  }
}
