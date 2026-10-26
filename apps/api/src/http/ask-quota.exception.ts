import { HttpException, HttpStatus } from '@nestjs/common';
import { parseAskQuotaRejection, type AskQuotaRejection } from '@rei/contracts';
import type { AskQuotaError } from '@rei/application';

export class AskQuotaException extends HttpException {
  public readonly refusal: AskQuotaRejection;
  public constructor(error: AskQuotaError) {
    const refusal = parseAskQuotaRejection({
      code: 'quota_exceeded',
      scope: error.scope,
      reopensAt: error.reopensAt,
    });
    super(refusal, HttpStatus.TOO_MANY_REQUESTS);
    this.refusal = refusal;
  }
}
