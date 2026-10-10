import { ExternalFailure, type SnapshotGeneration } from '@rei/application';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export interface SnapshotEncryptionConfig {
  readonly keyId: string;
  readonly keyBase64: string;
}

function fail(): never {
  throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.crypto' });
}

function base64(value: unknown, length?: number): Buffer {
  if (typeof value !== 'string' || value.length > 2_000_000) return fail();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (length !== undefined && bytes.length !== length))
    return fail();
  return bytes;
}

/** Versioned AES-256-GCM envelope; provider metadata is never authentication evidence. */
export class SnapshotAeadCodec {
  readonly #key: Buffer;
  public readonly keyId: string;
  public constructor(config: SnapshotEncryptionConfig) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(config.keyId)) fail();
    this.#key = base64(config.keyBase64, 32);
    this.keyId = config.keyId;
  }

  private aad(generation: SnapshotGeneration): Buffer {
    if (generation.keyId !== this.keyId) return fail();
    return Buffer.from(
      JSON.stringify([
        1,
        generation.objectKey,
        generation.contentHash,
        generation.mediaType,
        generation.keyId,
      ]),
    );
  }

  public encrypt(bytes: Uint8Array, generation: SnapshotGeneration): Uint8Array {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.#key, nonce, { authTagLength: 16 });
    cipher.setAAD(this.aad(generation));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return Buffer.from(
      JSON.stringify({
        version: 1,
        keyId: this.keyId,
        nonce: nonce.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      }),
    );
  }

  public decrypt(bytes: Uint8Array, generation: SnapshotGeneration): Uint8Array {
    try {
      if (bytes.byteLength > 2_000_000) return fail();
      const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail();
      const envelope = value as Record<string, unknown>;
      if (
        Object.keys(envelope).sort().join(',') !== 'ciphertext,keyId,nonce,tag,version' ||
        envelope.version !== 1 ||
        envelope.keyId !== generation.keyId
      )
        return fail();
      const decipher = createDecipheriv('aes-256-gcm', this.#key, base64(envelope.nonce, 12), {
        authTagLength: 16,
      });
      decipher.setAAD(this.aad(generation));
      decipher.setAuthTag(base64(envelope.tag, 16));
      const plaintext = Buffer.concat([
        decipher.update(base64(envelope.ciphertext)),
        decipher.final(),
      ]);
      if (
        `sha256:${createHash('sha256').update(plaintext).digest('hex')}` !==
          generation.contentHash ||
        plaintext.byteLength !== generation.byteLength
      )
        return fail();
      return plaintext;
    } catch {
      return fail();
    }
  }
}
