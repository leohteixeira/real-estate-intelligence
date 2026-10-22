import { cleanupAll, preserveCleanup } from './cleanup.ts';

interface AskAttemptOutcome {
  readonly failed: boolean;
  readonly actionFailed: boolean;
  readonly produced: readonly string[];
}

/** Attempt every capture and the ledger, preserving original errors including falsy throws. */
export async function runAskAttempt(
  work: () => Promise<unknown>,
  lifecycle: {
    captures: readonly { readonly name: string; readonly run: () => Promise<unknown> }[];
    report: (outcome: AskAttemptOutcome) => Promise<unknown>;
  },
): Promise<void> {
  let actionFailed = false;
  let evidenceFailed = false;
  const produced: string[] = [];
  await preserveCleanup(
    async () => {
      try {
        await work();
      } catch (error) {
        actionFailed = true;
        throw error;
      }
    },
    () =>
      preserveCleanup(
        () =>
          cleanupAll(
            ...lifecycle.captures.map((capture) => async () => {
              try {
                await capture.run();
                produced.push(capture.name);
              } catch (error) {
                evidenceFailed = true;
                throw error;
              }
            }),
          ),
        () => lifecycle.report({ failed: actionFailed || evidenceFailed, actionFailed, produced }),
      ),
  );
}
