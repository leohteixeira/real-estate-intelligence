import { describe, expect, it, vi } from 'vitest';
import type { Page } from 'playwright';
import { settlePropertyCaptureStart } from './property-capture.ts';

describe('Property capture framing', () => {
  it('settles before readback and returns only an asserted zero-scroll frame', async () => {
    const scroll = { x: 0, y: 0, documentTop: 0, documentLeft: 0 };
    const evaluate = vi
      .fn<Page['evaluate']>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(scroll);
    expect(await settlePropertyCaptureStart({ evaluate })).toEqual(scroll);
    expect(evaluate).toHaveBeenCalledTimes(2);
  });
  it.each([
    { x: 0, y: 1200, documentTop: 1200, documentLeft: 0 },
    { x: 1, y: 0, documentTop: 0, documentLeft: 1 },
  ])('rejects a displaced named top frame %j', async (scroll) => {
    const evaluate = vi
      .fn<Page['evaluate']>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(scroll);
    await expect(settlePropertyCaptureStart({ evaluate })).rejects.toThrow();
  });
});
