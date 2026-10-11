// Independent of the runner, so fresh-process probes can preserve failures too.
export async function preserveCleanup<T>(
  work: () => Promise<T>,
  cleanup: () => Promise<unknown>,
): Promise<T> {
  let primary: unknown;
  let primaryThrown = false;
  let value: T | undefined;
  try {
    value = await work();
  } catch (error) {
    primary = error;
    primaryThrown = true;
  }
  let failure: unknown;
  let cleanupThrown = false;
  try {
    await cleanup();
  } catch (error) {
    failure = error;
    cleanupThrown = true;
  }
  if (primaryThrown && cleanupThrown)
    throw new AggregateError([primary, failure], 'Campaign and cleanup failed.');
  if (primaryThrown) throw primary;
  if (cleanupThrown) throw failure;
  return value as T;
}

// Run every resource release in order, even if an earlier release fails.
export async function cleanupAll(...tasks: Array<() => Promise<unknown>>) {
  const failures: unknown[] = [];
  for (const task of tasks) {
    try {
      await task();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Resource cleanup failed.');
}
