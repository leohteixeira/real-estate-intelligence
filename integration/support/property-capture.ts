import type { Page } from 'playwright';
import { expect } from 'vitest';

/** Keyboard/hash checks must not silently turn a named top capture into a scrolled viewport. */
export async function settlePropertyCaptureStart(page: Pick<Page, 'evaluate'>) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0, 0);
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
