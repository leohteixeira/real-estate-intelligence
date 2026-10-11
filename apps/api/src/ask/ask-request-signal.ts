import type { Request } from 'express';
/** Disconnect is cancellation, not a business failure. Remove listeners on every settlement. */
export async function askRequestWork<T>(
  request: Request,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const stopped = () => controller.abort(new Error('Ask request cancelled.'));
  const closed = () => {
    if (!request.res?.writableEnded) stopped();
  };
  request.once('aborted', stopped);
  request.res?.once('close', closed);
  if (request.aborted || request.res?.destroyed) stopped();
  try {
    return await work(controller.signal);
  } finally {
    request.removeListener('aborted', stopped);
    request.res?.removeListener('close', closed);
  }
}
