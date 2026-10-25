import sharp from 'sharp';
import { ExternalFailure, type ImageFingerprintComputer } from '@rei/application';
import { dhash64 } from '@rei/domain';

export const MAX_PHOTO_BYTES = 5 * 1_024 * 1_024;
export const MAX_PHOTO_PIXELS = 16_000_000;
// No image cache, bounded libvips threads, one native image operation at a time per process.
sharp.cache(false);
sharp.concurrency(1);
let previous: Promise<void> = Promise.resolve();

export class SharpImageFingerprint implements ImageFingerprintComputer {
  public async compute(bytes: Uint8Array, signal: AbortSignal): Promise<string> {
    if (signal.aborted)
      throw new ExternalFailure({ kind: 'cancelled', operation: 'collection.source.photo' });
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PHOTO_BYTES)
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.source.photo' });
    const waiting = previous;
    let release!: () => void;
    previous = new Promise<void>((resolve) => {
      release = resolve;
    });
    await waiting;
    let pipeline: ReturnType<typeof sharp> | undefined;
    const cancel = () => pipeline?.destroy();
    try {
      signal.throwIfAborted();
      pipeline = sharp(bytes, {
        limitInputPixels: MAX_PHOTO_PIXELS,
        failOn: 'warning',
        animated: false,
      });
      signal.addEventListener('abort', cancel, { once: true });
      const metadata = await pipeline.metadata();
      signal.throwIfAborted();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) !== 1)
        throw new TypeError('Unsupported photo.');
      const pixels = await pipeline
        .autoOrient()
        .flatten({ background: '#ffffff' })
        .grayscale()
        .resize(9, 8, { fit: 'fill', kernel: 'lanczos3' })
        .raw({ depth: 'uchar' })
        .timeout({ seconds: 2 })
        .toBuffer();
      signal.throwIfAborted();
      return dhash64(pixels);
    } catch {
      throw new ExternalFailure({
        kind: signal.aborted ? 'cancelled' : 'rejected',
        operation: 'collection.source.photo',
      });
    } finally {
      signal.removeEventListener('abort', cancel);
      pipeline?.destroy();
      release();
    }
  }
}
