import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { isExternalFailure } from '@rei/application';

import { runSeedSyntheticCommand } from './seed-synthetic-command';

void runSeedSyntheticCommand(process.argv, process.env).catch((error: unknown) => {
  const failure = isExternalFailure(error)
    ? `${error.name}:${error.kind}:${error.operation}`
    : error instanceof Error
      ? error.name
      : 'Error';
  new Logger('seed-synthetic').error(`synthetic seed failed (${failure})`);
  process.exitCode = 1;
});
