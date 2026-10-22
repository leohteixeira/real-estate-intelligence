import { createServer } from 'node:http';
import { chromium, type Page } from 'playwright';
import { expect, test } from 'vitest';
import { preserveCleanup } from './cleanup.ts';
import {
  holdAccessibilityRead,
  type AccessibilityFaultTransport,
  type AccessibilityFaultRoute,
} from './accessibility-fault.ts';

function browserRead(page: Page, url: string) {
  // Browser-native transport under test, not a Node integration HTTP oracle.
  return page.evaluate(
    (endpoint) =>
      new Promise<{ status: number; text: string }>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('GET', endpoint);
        request.onload = () => resolve({ status: request.status, text: request.responseText });
        request.onerror = () => reject(new Error('Browser transport failed'));
        request.onabort = () => resolve({ status: 0, text: 'aborted' });
        (window as Window & { abortRead?: () => void }).abortRead = () => request.abort();
        request.send();
      }),
    url,
  );
}

test('transport faults drain held handlers after browser cancellation without a second route action', async () => {
  const bytes = JSON.stringify({ transport: 'actual loopback response' });
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>Transport fixture</title><main>Loopback fixture</main>');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(bytes);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  await preserveCleanup(
    async () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing loopback port');
      const base = `http://127.0.0.1:${address.port}`;
      const env = { ...process.env };
      delete env.DISPLAY;
      const browser = await chromium.launch({
        channel: 'chromium',
        env,
        args: ['--ozone-platform=headless'],
      });
      await preserveCleanup(
        async () => {
          const page = await browser.newPage();
          page.setDefaultTimeout(5000);
          await page.goto(base);
          const fault = await holdAccessibilityRead(page, `${base}/read`, bytes);
          await preserveCleanup(
            async () => {
              const pending = browserRead(page, `${base}/read`);
              await expect.poll(() => fault.requested.length).toBe(1);
              await page.evaluate(() =>
                (window as Window & { abortRead?: () => void }).abortRead!(),
              );
              expect(await pending).toEqual({ status: 0, text: 'aborted' });
              fault.setMode('refused');
              await expect.poll(() => fault.delivered.length).toBe(1);
              // Aborting JS transport can precede the driver's request-failure notification.
              // Preserve the actual action/failure, without claiming the 503 reached cancelled UI.
              expect(['aborted', 'refused']).toContain(fault.delivered[0]!.mode);
              expect(await browserRead(page, `${base}/read`)).toEqual({ status: 503, text: bytes });
              fault.setMode('malformed');
              expect(await browserRead(page, `${base}/read`)).toEqual({
                status: 200,
                text: bytes.slice(0, -1),
              });
              fault.setMode('held');
              const draining = browserRead(page, `${base}/read`);
              await expect.poll(() => fault.requested.length).toBe(4);
              await fault.close();
              expect(await draining).toEqual({ status: 0, text: 'aborted' });
              expect(fault.delivered.slice(1).map((entry) => entry.mode)).toEqual([
                'refused',
                'malformed',
                'cleanup-aborted',
              ]);
              expect(fault.errors).toEqual([]);
            },
            () => fault.close(),
          );
          // Browser-native transport under test reproduces the product's AbortController;
          // it is not a Node HTTP oracle (independent integration oracles use Supertest).
          // XHR cancellation above does not reproduce the driver's pending-continue deadlock;
          // fetch + AbortController does. Keep the actual product transport for that regression.
          // Narrow deadline path: aborted fetch -> held handler explicitly cancelled at cleanup ->
          // original disclosure failure must survive drain, not hang the outer cleanup.
          await page.setContent(
            '<details open><summary>Formula</summary><p>Evidence</p></details>',
          );
          const deadlineFault = await holdAccessibilityRead(page, `${base}/deadline`, bytes);
          let transportResult: string | null = null;
          const pendingFetch = page.evaluate(async (endpoint) => {
            const controller = new AbortController();
            (window as Window & { abortRead?: () => void }).abortRead = () => controller.abort();
            try {
              await window.fetch(endpoint, { signal: controller.signal });
              return 'completed';
            } catch (error) {
              return String(error);
            }
          }, `${base}/deadline`);
          void pendingFetch.then((result) => {
            transportResult = result;
          });
          await expect
            .poll(() => ({ count: deadlineFault.requested.length, transportResult }))
            .toEqual({ count: 1, transportResult: null });
          await page.evaluate(() => (window as Window & { abortRead?: () => void }).abortRead!());
          expect(await pendingFetch).toContain('AbortError');
          let primary: unknown;
          const preserved = preserveCleanup(
            async () => {
              await page.locator('summary').click();
              try {
                expect(
                  await page.locator('p').isVisible(),
                  'Open-disclosure precondition failure',
                ).toBe(true);
              } catch (error) {
                primary = error;
                throw error;
              }
            },
            () => deadlineFault.close(),
          );
          const observed = await preserved.catch((error: unknown) => error);
          expect(primary).toBeDefined();
          expect(observed).toBe(primary);
          expect(deadlineFault.cleanup.error).toBeNull();
          expect(deadlineFault.errors).toEqual([]);
          expect(deadlineFault.delivered).toHaveLength(1);
          expect(deadlineFault.delivered[0]!.mode).toBe('cleanup-aborted');
          // Distinct boundary: Chromium has already reported requestfailed before release.
          // The intercepted Route still needs its first explicit terminal action.
          const failedPage = await browser.newPage();
          await failedPage.goto(base);
          const failedFault = await holdAccessibilityRead(
            failedPage,
            `${base}/known-aborted`,
            bytes,
          );
          const failed = failedPage
            .waitForEvent('requestfailed', {
              predicate: (request) => request.url() === `${base}/known-aborted`,
              timeout: 5000,
            })
            .then(
              (request) => ({ request }),
              (error: unknown) => ({ error }),
            );
          const cancelled = browserRead(failedPage, `${base}/known-aborted`);
          await expect.poll(() => failedFault.requested.length).toBe(1);
          await failedPage.evaluate(() =>
            (window as Window & { abortRead?: () => void }).abortRead!(),
          );
          expect(await cancelled).toEqual({ status: 0, text: 'aborted' });
          const observedFailure = await failed;
          if ('error' in observedFailure) throw observedFailure.error;
          failedFault.setMode('valid');
          await expect.poll(() => failedFault.delivered.length).toBe(1);
          await failedFault.close();
          expect(failedFault.delivered[0]!.mode).toBe('aborted');
          expect(failedFault.errors).toEqual([]);
        },
        () => browser.close(),
      );
    },
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );
});

test('bounded drain preserves the primary error and returns control to outer cleanup', async () => {
  const page: AccessibilityFaultTransport = {
    route: async () => undefined,
    unrouteAll: () => new Promise<void>(() => undefined),
  };
  const fault = await holdAccessibilityRead(page, '/held', '{}');
  const primary = new Error('Original disclosure failure');
  const result = await preserveCleanup(
    async () => {
      throw primary;
    },
    () => fault.close(),
  ).catch((error: unknown) => error);
  expect(result).toBeInstanceOf(AggregateError);
  if (!(result instanceof AggregateError)) throw new Error('Expected preserved cleanup failure');
  const errors: unknown[] = result.errors;
  expect(errors[0]).toBe(primary);
  expect(String(errors[1])).toContain('5000ms bound');
  expect(fault.cleanup.error).toContain('5000ms bound');
  expect(fault.cleanup.finishedAt).not.toBeNull();
}, 10_000);

test('handler failures remain surfaced with an unfinished dispatch receipt', async () => {
  let handler: ((route: AccessibilityFaultRoute) => Promise<void>) | undefined;
  const page: AccessibilityFaultTransport = {
    route: async (_pattern: string, next: typeof handler) => {
      handler = next;
    },
    unrouteAll: async () => undefined,
  };
  const fault = await holdAccessibilityRead(page, '/read', '{}');
  fault.setMode('valid');
  await handler!({
    request: () => ({ url: () => '/read', failure: () => null }),
    continue: async () => {
      throw new Error('Driver continue failed');
    },
    abort: async () => undefined,
    fulfill: async () => undefined,
  });
  await expect(fault.close()).rejects.toThrow('Fault route handlers failed');
  expect(fault.errors[0]!.error).toContain('Driver continue failed');
  expect(fault.dispatches[0]).toMatchObject({ mode: 'valid', url: '/read', finishedAt: null });
  expect(fault.cleanup.error).toContain('Fault route handlers failed');
});
