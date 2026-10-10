import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { readConfig } from './config';
import { configureApi } from './configure-api';

async function bootstrap(): Promise<void> {
  const config = readConfig(process.env);
  const app = await NestFactory.create(AppModule);

  configureApi(app);
  app.enableShutdownHooks();

  // Bind to every interface so Dev Container port forwarding works.
  await app.listen(config.port, '0.0.0.0');

  new Logger('bootstrap').log(`the api is listening on 0.0.0.0:${config.port}`);
}

void bootstrap();
