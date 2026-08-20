import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { API_PREFIX } from '@rei/contracts';

import { AppModule } from './app.module';
import { readConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = readConfig(process.env);
  const app = await NestFactory.create(AppModule);

  // Business endpoints live under the versioned prefix; /health and /ready are
  // operational and stay outside the product contract.
  app.setGlobalPrefix(API_PREFIX, { exclude: ['health', 'ready'] });
  app.enableShutdownHooks();

  // Bind to every interface so Dev Container port forwarding works.
  await app.listen(config.port, '0.0.0.0');

  new Logger('bootstrap').log(`the api is listening on 0.0.0.0:${config.port}`);
}

void bootstrap();
