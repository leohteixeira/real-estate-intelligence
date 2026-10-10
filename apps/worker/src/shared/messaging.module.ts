import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { EVENT_PUBLISHER, EVENT_SUBSCRIBER } from '@rei/application';
import { RabbitMqEventBroker } from '@rei/infrastructure';

import { readConfig } from '../config';
import { ResilienceTelemetry } from './resilience/resilience-telemetry';
import { ResilientEventPublisher } from './resilience/resilient-event-publisher';

@Global()
@Module({
  providers: [
    {
      provide: RabbitMqEventBroker,
      useFactory: (): RabbitMqEventBroker => {
        const config = readConfig(process.env);
        return new RabbitMqEventBroker({
          url: config.rabbitMqUrl,
          operationTimeoutMs: config.operationTimeoutMs,
          handlerTimeoutMs: config.eventHandlerTimeoutMs,
          drainTimeoutMs: config.brokerDrainTimeoutMs,
          prefetch: config.collectionPrefetch,
          deliveryLimit: config.eventDeliveryLimit,
          redeliveryDelayMs: config.eventRedeliveryDelayMs,
        });
      },
    },
    {
      provide: EVENT_PUBLISHER,
      inject: [RabbitMqEventBroker],
      useFactory: (broker: RabbitMqEventBroker): ResilientEventPublisher =>
        new ResilientEventPublisher(broker),
    },
    { provide: EVENT_SUBSCRIBER, useExisting: RabbitMqEventBroker },
    ResilienceTelemetry,
  ],
  exports: [RabbitMqEventBroker, EVENT_PUBLISHER, EVENT_SUBSCRIBER],
})
export class MessagingModule implements OnApplicationShutdown {
  public constructor(private readonly broker: RabbitMqEventBroker) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.broker.close();
  }
}
