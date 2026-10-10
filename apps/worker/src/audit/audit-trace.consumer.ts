import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_EVENT_LOG,
  EVENT_SUBSCRIBER,
  type AuditEventLog,
  type EventSubscriber,
} from '@rei/application';
import { AUDIT_TRACE_REQUESTED_TYPE } from '@rei/domain';

@Injectable()
export class AuditTraceConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(AUDIT_EVENT_LOG) private readonly auditLog: AuditEventLog,
  ) {}

  public async start(): Promise<void> {
    await this.subscriber.subscribe(AUDIT_TRACE_REQUESTED_TYPE, async (event) => {
      await this.auditLog.append(event);
    });
  }
}
