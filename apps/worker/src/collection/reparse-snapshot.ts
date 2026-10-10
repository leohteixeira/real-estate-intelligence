import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { isExternalFailure } from '@rei/application';
import { runSnapshotReparseCommand } from './reparse-snapshot-command';

void runSnapshotReparseCommand(process.argv, process.env).catch((error: unknown) => {
  const failure = isExternalFailure(error)
    ? `${error.name}:${error.kind}:${error.operation}`
    : error instanceof Error
      ? error.name
      : 'Error';
  new Logger('reparse-snapshot').error(`Snapshot reparse failed (${failure})`);
  process.exitCode = 1;
});
