import 'reflect-metadata';
import { isExternalFailure } from '@rei/application';
import { runFoundationExecutionCommand } from './run-execution-command';

void runFoundationExecutionCommand(process.env).catch((error: unknown) => {
  const kind = isExternalFailure(error) ? error.kind : 'rejected';
  console.error(JSON.stringify({ code: 'foundation_execution_failed', kind }));
  process.exitCode = 1;
});
