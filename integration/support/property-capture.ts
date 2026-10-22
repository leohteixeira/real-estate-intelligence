import type { Page } from 'playwright';
import { expect } from 'vitest';

/** Keyboard/hash checks must not silently turn a named top capture into a scrolled viewport. */
export async function settlePropertyCaptureStart(page: Pick<Page, 'evaluate'>) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    // Native key scrolling can still be in flight even with CSS scroll-behavior:auto.
    // Observe its actual resting position before the separate capture reset. This is
    // bounded preparation after the saved traversal, not repeated corrective scrolling.
    const started = performance.now();
    let previousX = window.scrollX,
      previousY = window.scrollY,
      stationaryFrames = 0,
      stationarySince = started;
    // A few equal frames can precede the next native smooth-key-scroll update. Require
    // an actual quiet interval as well as frames; never retry/reset a displaced capture.
    while (stationaryFrames < 3 || performance.now() - stationarySince < 150) {
      await new Promise(requestAnimationFrame);
      if (previousX === window.scrollX && previousY === window.scrollY) stationaryFrames++;
      else {
        stationaryFrames = 0;
        stationarySince = performance.now();
      }
      previousX = window.scrollX;
      previousY = window.scrollY;
      if (performance.now() - started > 2000)
        throw new Error('Native scrolling did not settle before top capture within 2000ms');
    }
    // Capture preparation runs after interaction evidence; never inherit a page's smooth
    // tour animation and accidentally label an intermediate viewport as its top.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  const scroll = await page.evaluate(() => ({
    x: window.scrollX,
    y: window.scrollY,
    documentTop: document.scrollingElement?.scrollTop ?? 0,
    documentLeft: document.scrollingElement?.scrollLeft ?? 0,
  }));
  expect(scroll).toEqual({ x: 0, y: 0, documentTop: 0, documentLeft: 0 });
  return scroll;
}
