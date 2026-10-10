import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { isExternalFailure } from '@rei/application';

import { runSyntheticCollectionCommand } from './synthetic-collection-command';

void runSyntheticCollectionCommand(process.argv, process.env).catch((error: unknown) => {
  const logger = new Logger('collect-synthetic');
  const failure = isExternalFailure(error)
    ? `${error.name}:${error.kind}:${error.operation}`
    : error instanceof Error
      ? error.name
      : 'Error';
  logger.error(`synthetic collection failed (${failure})`);
  process.exitCode = 1;
});
