import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { isExternalFailure } from '@rei/application';
import { runListingRemovalCommand } from './remove-listing-command';

void runListingRemovalCommand(process.argv, process.env).catch((error: unknown) => {
  const failure = isExternalFailure(error)
    ? `${error.name}:${error.kind}:${error.operation}`
    : error instanceof Error
      ? error.name
      : 'Error';
  new Logger('remove-listing').error(`Listing removal failed (${failure})`);
  process.exitCode = 1;
});
