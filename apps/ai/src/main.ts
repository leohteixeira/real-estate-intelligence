import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { readConfig } from './config';

async function bootstrap(): Promise<void> {
  const config = readConfig(process.env);
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');

  new Logger('bootstrap').log(`the AI service is listening on 0.0.0.0:${config.port}`);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown startup error';
  new Logger('bootstrap').error(`the AI service failed to start: ${message}`);
  process.exitCode = 1;
});
