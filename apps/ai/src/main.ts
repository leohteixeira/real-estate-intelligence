import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { readConfig } from './config';
import { configureExecutionHttp } from './execution/execution.http';

async function bootstrap(): Promise<void> {
  const config = readConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    abortOnError: false,
    logger: false,
  });
  configureExecutionHttp(app, config.internalToken);

  app.enableShutdownHooks();

  await app.listen(config.port, '0.0.0.0');

  new Logger('bootstrap').log(`the AI service is listening on 0.0.0.0:${config.port}`);
}

void bootstrap().catch(() => {
  new Logger('bootstrap').error('the AI service failed to start');
  process.exitCode = 1;
});
