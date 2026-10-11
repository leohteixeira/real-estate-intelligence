function cleanupError(message: string, cause: unknown) {
  return new Error(message, { cause });
}

export async function coordinateSourceRegisterCleanup({
  primaryFailure,
  primaryThrown = primaryFailure !== undefined,
  close,
  down,
  onSuccess,
}: {
  primaryFailure?: unknown;
  primaryThrown?: boolean;
  close: () => Promise<unknown>;
  down: () => Promise<unknown>;
  onSuccess: () => Promise<unknown>;
}) {
  const cleanupFailures: Error[] = [];

  try {
    await close();
  } catch (error) {
    cleanupFailures.push(
      cleanupError('Closing the source-register database connection failed.', error),
    );
  }

  try {
    await down();
  } catch (error) {
    cleanupFailures.push(
      cleanupError('Removing the source-register integration project failed.', error),
    );
  }

  if (primaryThrown && cleanupFailures.length > 0) {
    throw new AggregateError(
      [primaryFailure, ...cleanupFailures],
      'The source-register campaign and its cleanup failed.',
    );
  }
  if (primaryThrown) throw primaryFailure;
  if (cleanupFailures.length === 1) throw cleanupFailures[0];
  if (cleanupFailures.length > 1) {
    throw new AggregateError(
      cleanupFailures,
      'Multiple source-register cleanup operations failed.',
    );
  }

  await onSuccess();
}
