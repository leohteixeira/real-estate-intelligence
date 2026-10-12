import { HttpException, HttpStatus } from '@nestjs/common';
import { parseAskPendingLimit, type AskPendingLimit } from '@rei/contracts';

/** The sole specialized public refusal permitted by the global error sanitizer. */
export class AskPendingLimitException extends HttpException {
  public readonly refusal: AskPendingLimit;

  public constructor() {
    const refusal = parseAskPendingLimit({ code: 'thread_pending_limit', limit: 3 });
    super(refusal, HttpStatus.TOO_MANY_REQUESTS);
    this.refusal = refusal;
  }
}
