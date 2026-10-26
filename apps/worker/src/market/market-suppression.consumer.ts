import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumeMarketSuppression,
  EVENT_SUBSCRIBER,
  MARKET_SUPPRESSION_CONSUMER,
  type EventSubscriber,
} from '@rei/application';
import {
  COLLECTION_LISTING_SUPPRESSED_TYPE,
  PROPERTIES_LISTING_SUPPRESSED_TYPE,
} from '@rei/domain';
@Injectable()
export class MarketSuppressionConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    @Inject(ConsumeMarketSuppression) private readonly service: ConsumeMarketSuppression,
  ) {}
  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      {
        consumerName: MARKET_SUPPRESSION_CONSUMER,
        eventTypes: [COLLECTION_LISTING_SUPPRESSED_TYPE, PROPERTIES_LISTING_SUPPRESSED_TYPE],
      },
      (event, delivery) => this.service.execute(event, delivery.signal),
    );
  }
}
