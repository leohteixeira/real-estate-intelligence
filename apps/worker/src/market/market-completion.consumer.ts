import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumeMarketCompletion,
  EVENT_SUBSCRIBER,
  MARKET_COMPLETION_CONSUMER,
  type EventSubscriber,
} from '@rei/application';
import { COLLECTION_RUN_COMPLETED_TYPE } from '@rei/domain';
@Injectable()
export class MarketCompletionConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(ConsumeMarketCompletion) private readonly service: ConsumeMarketCompletion,
  ) {}
  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      { consumerName: MARKET_COMPLETION_CONSUMER, eventTypes: [COLLECTION_RUN_COMPLETED_TYPE] },
      async (event, delivery) => this.service.execute(event, delivery.signal),
    );
  }
}
