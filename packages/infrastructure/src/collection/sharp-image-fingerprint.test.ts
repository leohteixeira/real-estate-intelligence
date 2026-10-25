import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SharpImageFingerprint, MAX_PHOTO_BYTES } from './sharp-image-fingerprint.js';

const computer = new SharpImageFingerprint();
const signal = () => AbortSignal.timeout(5_000);
const increasing = Buffer.from(Array.from({ length: 72 }, (_, i) => (i % 9) * 30));

describe('pinned photograph normalization', () => {
  it.each(['jpeg', 'png', 'webp'] as const)(
    'decodes actual %s and deterministically hashes brightness order',
    async (format) => {
      const bytes = await sharp(increasing, { raw: { width: 9, height: 8, channels: 1 } })
        .toFormat(format)
        .toBuffer();
      expect(await computer.compute(bytes, signal())).toBe('dhash64-v1:ffffffffffffffff');
      expect(await computer.compute(bytes, signal())).toBe('dhash64-v1:ffffffffffffffff');
    },
  );
  it('flattens alpha over white and honors EXIF orientation', async () => {
    const rgba = Buffer.from(Array.from({ length: 72 * 4 }, (_, i) => (i % 4 === 3 ? 0 : i % 255)));
    const transparent = await sharp(rgba, { raw: { width: 9, height: 8, channels: 4 } })
      .png()
      .toBuffer();
    expect(await computer.compute(transparent, signal())).toBe('dhash64-v1:0000000000000000');
    const normal = sharp(increasing, { raw: { width: 9, height: 8, channels: 1 } });
    const flipped = await normal.clone().flop().withMetadata({ orientation: 2 }).png().toBuffer();
    expect(await computer.compute(flipped, signal())).toBe('dhash64-v1:ffffffffffffffff');
  });
  it('rejects unsupported/corrupt/oversized and over-pixel inputs categorically', async () => {
    const cases = [
      Buffer.from('<svg/>'),
      new Uint8Array(),
      new Uint8Array(MAX_PHOTO_BYTES + 1),
      await sharp({ create: { width: 4001, height: 4000, channels: 3, background: 'white' } })
        .png()
        .toBuffer(),
    ];
    for (const bytes of cases)
      await expect(computer.compute(bytes, signal())).rejects.toMatchObject({
        kind: 'rejected',
        operation: 'collection.source.photo',
      });
    const controller = new AbortController();
    controller.abort();
    await expect(computer.compute(increasing, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
  });
});
