import { Module } from '@nestjs/common';
import { BROKER_AVAILABILITY_PROBE } from '@rei/application';
import { RabbitMqAvailabilityProbe } from '@rei/infrastructure';

import { readConfig } from '../config';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  providers: [
    {
      provide: BROKER_AVAILABILITY_PROBE,
      useFactory: (): RabbitMqAvailabilityProbe =>
        new RabbitMqAvailabilityProbe(readConfig(process.env).rabbitMqUrl),
    },
  ],
})
export class HealthModule {}
