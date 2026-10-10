/**
 * Removes any embedded credential from a driver error message.
 *
 * `pg` echoes the connection string in some failures, and that string must
 * never reach a log or an API response.
 */
export function redactConnectionError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  const redacted = message.replace(
    /\b([a-z][a-z0-9+.-]*):\/\/[^\s/@]+:[^\s/@]+@/gi,
    '$1://redacted:redacted@',
  );

  return new Error(redacted);
}
