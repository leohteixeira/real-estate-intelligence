import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { isExternalFailure } from '@rei/application';

import { runResumableCollectionCommand } from './resumable-collection-command';

void runResumableCollectionCommand(process.argv, process.env).catch((error: unknown) => {
  const failure = isExternalFailure(error)
    ? `${error.name}:${error.kind}:${error.operation}`
    : error instanceof Error
      ? error.name
      : 'Error';
  new Logger('collect-resumable').error(`resumable collection failed (${failure})`);
  process.exitCode = 1;
});
