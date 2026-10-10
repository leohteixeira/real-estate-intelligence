import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { RequestAuditTrace } from '@rei/application';
import type { AuditTraceAcceptedResponse } from '@rei/contracts';

@Controller('audit/traces')
export class AuditController {
  public constructor(private readonly requestAuditTrace: RequestAuditTrace) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  public async requestTrace(): Promise<AuditTraceAcceptedResponse> {
    const eventId = await this.requestAuditTrace.execute();
    return { eventId };
  }
}
