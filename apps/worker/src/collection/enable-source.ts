import 'reflect-metadata';
import { Logger } from '@nestjs/common';

import { runSourceEnableCommand, SourceEnableCommandError } from './enable-source-command';

void runSourceEnableCommand(process.argv).catch((error: unknown) => {
  const logger = new Logger('source-enable');
  const message =
    error instanceof SourceEnableCommandError ? error.message : 'source register operation failed';
  logger.error(message.slice(0, 200));
  process.exitCode = 1;
});
