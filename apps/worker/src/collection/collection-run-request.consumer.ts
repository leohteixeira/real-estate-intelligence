import { Inject, Injectable } from '@nestjs/common';
import {
  ConsumeCollectionRunRequest,
  EVENT_SUBSCRIBER,
  SCHEDULED_COLLECTION_CONSUMER,
  type EventSubscriber,
} from '@rei/application';
import { COLLECTION_RUN_REQUESTED_TYPE, parseCollectionRunRequested } from '@rei/domain';
import { runScheduledCollectionSpan } from '@rei/infrastructure';

import { readScheduledCollectionConfig } from '../config';
import { CollectionRunLimiter } from './collection-run-limiter';

@Injectable()
export class CollectionRunRequestConsumer {
  public constructor(
    @Inject(EVENT_SUBSCRIBER) private readonly subscriber: EventSubscriber,
    private readonly service: ConsumeCollectionRunRequest,
    private readonly limiter: CollectionRunLimiter,
  ) {}

  public async start(): Promise<void> {
    await this.subscriber.subscribe(
      {
        consumerName: SCHEDULED_COLLECTION_CONSUMER,
        eventTypes: [COLLECTION_RUN_REQUESTED_TYPE],
      },
      async (untrusted, delivery) => {
        const event = parseCollectionRunRequested(untrusted);
        const { runTimeoutMs } = readScheduledCollectionConfig(process.env);
        const signal = AbortSignal.any([delivery.signal, AbortSignal.timeout(runTimeoutMs)]);
        await this.limiter.run(event.payload.sourceId, signal, () =>
          runScheduledCollectionSpan(signal, () => this.service.execute(untrusted, signal)),
        );
      },
    );
  }
}
