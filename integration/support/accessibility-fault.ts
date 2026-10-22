/** Minimal transport port, structurally satisfied by real Playwright Page/Route instances. */
export interface AccessibilityFaultRoute {
  request(): { url(): string; failure(): { errorText: string } | null };
  continue(): Promise<void>;
  abort(errorCode: string): Promise<void>;
  fulfill(options: { status: number; body: string; contentType: string }): Promise<void>;
}

export interface AccessibilityFaultTransport {
  route(
    pattern: string,
    handler: (route: AccessibilityFaultRoute) => Promise<void>,
  ): Promise<unknown>;
  unrouteAll(options: { behavior: 'wait' }): Promise<void>;
}

/** Transport-only faults. Preserve real admitted bytes and drain every handler before unroute. */
export async function holdAccessibilityRead(
  page: AccessibilityFaultTransport,
  pattern: string,
  bytes: string,
) {
  let mode: 'held' | 'refused' | 'malformed' | 'valid' = 'held';
  const releases = new Set<() => void>();
  const requested: string[] = [];
  const delivered: Array<{ mode: string; url: string; failure: string | null }> = [];
  const errors: Array<{ url: string; error: string; failure: string | null }> = [];
  const dispatches: Array<{
    mode: string;
    url: string;
    startedAt: number;
    finishedAt: number | null;
  }> = [];
  const cleanup = {
    startedAt: null as number | null,
    finishedAt: null as number | null,
    error: null as string | null,
  };
  let closing: Promise<void> | undefined;
  let closingRequested = false;
  const handler = async (route: AccessibilityFaultRoute) => {
    const request = route.request();
    requested.push(request.url());
    try {
      if (mode === 'held') await new Promise<void>((resolve) => releases.add(resolve));
      if (closingRequested) {
        // Teardown is not recovery. Explicitly cancel a still-held interception instead of
        // continuing a request whose AbortController may already have abandoned it.
        await route.abort('aborted');
        delivered.push({
          mode: 'cleanup-aborted',
          url: request.url(),
          failure: request.failure()?.errorText ?? null,
        });
        return;
      }
      // Browser transport cancellation is not a terminal action on the intercepted Route.
      // Playwright awaits both our callback and its Route handling promise, so even an already
      // failed request needs its first explicit terminal abort. Never continue cancelled UI.
      const failure = request.failure()?.errorText ?? null;
      if (failure) {
        const dispatch = {
          mode: 'aborted',
          url: request.url(),
          startedAt: Date.now(),
          finishedAt: null as number | null,
        };
        dispatches.push(dispatch);
        await route.abort('aborted');
        dispatch.finishedAt = Date.now();
        delivered.push({ mode: 'aborted', url: request.url(), failure });
        return;
      }
      const delivery = mode;
      const dispatch = {
        mode: delivery,
        url: request.url(),
        startedAt: Date.now(),
        finishedAt: null as number | null,
      };
      dispatches.push(dispatch);
      if (delivery === 'refused')
        await route.fulfill({ status: 503, body: bytes, contentType: 'application/json' });
      else if (delivery === 'malformed')
        await route.fulfill({
          status: 200,
          body: bytes.slice(0, -1),
          contentType: 'application/json',
        });
      else await route.continue();
      dispatch.finishedAt = Date.now();
      delivered.push({ mode: delivery, url: request.url(), failure: null });
    } catch (error) {
      // Surface asynchronously raised route errors through the owning test/cleanup, never as an
      // unhandled rejection or silently ignored cancellation. The primary action stays preserved.
      errors.push({
        url: request.url(),
        error: String(error),
        failure: request.failure()?.errorText ?? null,
      });
    }
  };
  await page.route(pattern, handler);
  return {
    delivered,
    requested,
    errors,
    dispatches,
    setMode(next: typeof mode) {
      mode = next;
      if (next !== 'held') for (const release of releases) release();
    },
    cleanup,
    close() {
      return (closing ??= (async () => {
        cleanup.startedAt = Date.now();
        closingRequested = true;
        mode = 'valid';
        for (const release of releases) release();
        // A cancelled browser request can leave the driver's continue command pending.
        // Preserve that failure and return control to outer browser/SQL/fixture cleanup.
        // The losing drain promise remains observed; no handler error is suppressed.
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            page.unrouteAll({ behavior: 'wait' }),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      'Fault route drain exceeded its 5000ms bound; outer browser cleanup required',
                    ),
                  ),
                5000,
              );
            }),
          ]);
          if (errors.length)
            throw new AggregateError(
              errors.map((entry) => new Error(entry.error)),
              'Fault route handlers failed',
            );
        } catch (error) {
          cleanup.error = String(error);
          throw error;
        } finally {
          clearTimeout(timer);
          cleanup.finishedAt = Date.now();
        }
      })());
    },
  };
}
