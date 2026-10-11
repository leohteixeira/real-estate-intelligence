import { Inject, Injectable } from '@nestjs/common';
import { ConsumeAskRunRequest, EVENT_SUBSCRIBER, type EventSubscriber } from '@rei/application';
import { ASK_RUN_REQUESTED_TYPE, ASK_STRUCTURED_CONSUMER } from '@rei/domain';
@Injectable()
export class AskRunRequestConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    private readonly service: ConsumeAskRunRequest,
  ) {}
  public start(): Promise<void> {
    return this.subscriber.subscribe(
      { consumerName: ASK_STRUCTURED_CONSUMER, eventTypes: [ASK_RUN_REQUESTED_TYPE] },
      (event, delivery) => this.service.execute(event, delivery.signal, delivery.deadlineAt),
    );
  }
}
