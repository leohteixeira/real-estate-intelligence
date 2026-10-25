import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  ExternalFailure,
  type RawSnapshotStore,
  type StoredRawSnapshot,
  type StoreRawSnapshotInput,
  type SnapshotLifecycle,
  type SnapshotGeneration,
  type Clock,
} from '@rei/application';
import {
  parseSha256Hash,
  parseCollectionSourceListingId,
  sanitizeSnapshotListing,
  assertSnapshotIdentifier,
  isOwnedSyntheticSourceId,
} from '@rei/domain';
import { createHash } from 'node:crypto';
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { SnapshotAeadCodec, type SnapshotEncryptionConfig } from './snapshot-aead-codec.js';

export interface S3RawSnapshotStoreConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly encryption?: SnapshotEncryptionConfig;
  readonly lifecycle?: SnapshotLifecycle;
  readonly clock?: Clock;
  readonly reconciliationIntervalMs?: number;
}

function statusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const metadata = Reflect.get(error, '$metadata');
  if (typeof metadata !== 'object' || metadata === null) return undefined;
  const value = Reflect.get(metadata, 'httpStatusCode');
  return typeof value === 'number' ? value : undefined;
}

function externalFailure(
  error: unknown,
  signal: AbortSignal,
  operation = 'raw-snapshot.store',
): ExternalFailure {
  if (signal.aborted) {
    return new ExternalFailure({ kind: 'cancelled', operation });
  }
  const status = statusCode(error);
  if (status === 401 || status === 403) {
    return new ExternalFailure({ kind: 'unauthorized', operation });
  }
  if (status !== undefined && status >= 400 && status < 500) {
    return new ExternalFailure({ kind: 'rejected', operation });
  }
  return new ExternalFailure({ kind: 'transient', operation });
}

function isPreconditionFailure(error: unknown): boolean {
  return (
    statusCode(error) === 412 ||
    (typeof error === 'object' &&
      error !== null &&
      Reflect.get(error, 'name') === 'PreconditionFailed')
  );
}

function isExistingBucket(error: unknown): boolean {
  if (error instanceof BucketAlreadyOwnedByYou || error instanceof BucketAlreadyExists) return true;
  if (typeof error !== 'object' || error === null) return false;
  const name = Reflect.get(error, 'name');
  const code = Reflect.get(error, 'Code');
  return (
    name === 'BucketAlreadyOwnedByYou' ||
    name === 'BucketAlreadyExists' ||
    code === 'BucketAlreadyOwnedByYou' ||
    code === 'BucketAlreadyExists'
  );
}

function isMissingBucket(error: unknown): boolean {
  if (statusCode(error) === 404) return true;
  if (typeof error !== 'object' || error === null) return false;
  const name = Reflect.get(error, 'name');
  const code = Reflect.get(error, 'Code');
  return name === 'NotFound' || name === 'NoSuchBucket' || code === 'NoSuchBucket';
}

function isMissingObject(error: unknown): boolean {
  if (error instanceof NoSuchKey || statusCode(error) === 404) return true;
  if (typeof error !== 'object' || error === null) return false;
  const name = Reflect.get(error, 'name');
  const code = Reflect.get(error, 'Code');
  return name === 'NotFound' || name === 'NoSuchKey' || code === 'NoSuchKey';
}

function verifyExistingObjectMetadata(
  existing: {
    readonly ContentLength?: number;
    readonly Metadata?: Readonly<Record<string, string>>;
  },
  byteLength: number,
  contentHash: string,
): void {
  if (
    existing.ContentLength !== byteLength ||
    existing.Metadata?.['rei-content-hash'] !== contentHash
  ) {
    throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.store' });
  }
}

/** One-attempt S3-compatible adapter. Resilience is composed by its caller in later stories. */
export class S3RawSnapshotStore implements RawSnapshotStore {
  readonly #client: S3Client;
  readonly #bucket: string;
  #bucketReady: Promise<void> | undefined;
  readonly #lifecycle: SnapshotLifecycle | undefined;
  readonly #codec: SnapshotAeadCodec | undefined;
  readonly #clock: Clock;
  readonly #reconciliationIntervalMs: number;

  public constructor(config: S3RawSnapshotStoreConfig) {
    this.#bucket = config.bucket;
    this.#lifecycle = config.lifecycle;
    this.#codec = config.encryption ? new SnapshotAeadCodec(config.encryption) : undefined;
    this.#clock = config.clock ?? { now: () => new Date().toISOString() };
    this.#reconciliationIntervalMs = config.reconciliationIntervalMs ?? 300_000;
    if (
      !Number.isSafeInteger(this.#reconciliationIntervalMs) ||
      this.#reconciliationIntervalMs < 100 ||
      this.#reconciliationIntervalMs > 2_147_483_647
    )
      throw new RangeError('Snapshot reconciliation interval must be a bounded positive timer.');
    this.#client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      maxAttempts: 1,
      // A conditional PUT can close its socket on MinIO. Fresh sockets keep a winner read
      // one-attempt as well, without relying on the SDK's transport retry to recover it.
      requestHandler: {
        httpAgent: new HttpAgent({ keepAlive: false }),
        httpsAgent: new HttpsAgent({ keepAlive: false }),
      },
    });
  }

  async #ensureBucket(signal: AbortSignal): Promise<void> {
    this.#bucketReady ??= this.#client
      .send(new HeadBucketCommand({ Bucket: this.#bucket }), { abortSignal: signal })
      .then(() => undefined)
      .catch(async (error: unknown) => {
        if (!isMissingBucket(error)) throw error;
        try {
          await this.#client.send(new CreateBucketCommand({ Bucket: this.#bucket }), {
            abortSignal: signal,
          });
        } catch (createError) {
          if (!isExistingBucket(createError)) throw createError;
        }
      });
    try {
      await this.#bucketReady;
    } catch (error) {
      this.#bucketReady = undefined;
      throw error;
    }
  }

  async #verifyExistingObject(
    objectKey: string,
    existing: {
      readonly ContentLength?: number;
      readonly Metadata?: Readonly<Record<string, string>>;
    },
    byteLength: number,
    contentHash: string,
    signal: AbortSignal,
  ): Promise<void> {
    verifyExistingObjectMetadata(existing, byteLength, contentHash);
    const result = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
      { abortSignal: signal },
    );
    if (result.Body === undefined) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.store' });
    }
    const bytes = await result.Body.transformToByteArray();
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (`sha256:${digest}` !== contentHash) {
      throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.store' });
    }
  }

  public async store(
    input: StoreRawSnapshotInput,
    signal: AbortSignal,
  ): Promise<StoredRawSnapshot> {
    if (signal.aborted) throw externalFailure(signal.reason, signal);
    if (!input.synthetic)
      return this.#storeReal(input, signal).catch((error) => {
        if (error instanceof ExternalFailure) throw error;
        throw externalFailure(error, signal);
      });
    if (!isOwnedSyntheticSourceId(input.sourceId))
      throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.store' });
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    const contentHash = parseSha256Hash(`sha256:${digest}`);
    const objectKey = `synthetic/sha256/${digest}.json`;

    const upload = async (): Promise<StoredRawSnapshot> => {
      try {
        await this.#ensureBucket(signal);
        try {
          const existing = await this.#client.send(
            new HeadObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
            { abortSignal: signal },
          );
          await this.#verifyExistingObject(
            objectKey,
            existing,
            input.bytes.byteLength,
            contentHash,
            signal,
          );
          return Object.freeze({
            contentHash,
            objectKey,
            byteLength: input.bytes.byteLength,
            mediaType: input.mediaType,
          });
        } catch (error) {
          if (error instanceof ExternalFailure) throw error;
          if (!isMissingObject(error)) throw error;
        }
        try {
          await this.#client.send(
            new PutObjectCommand({
              Bucket: this.#bucket,
              Key: objectKey,
              Body: Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength),
              ContentLength: input.bytes.byteLength,
              ContentType: input.mediaType,
              IfNoneMatch: '*',
              Metadata: { 'rei-content-hash': contentHash, 'rei-source-id': input.sourceId },
            }),
            { abortSignal: signal },
          );
        } catch (error) {
          if (!isPreconditionFailure(error)) throw error;
          const existing = await this.#client.send(
            new HeadObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
            { abortSignal: signal },
          );
          await this.#verifyExistingObject(
            objectKey,
            existing,
            input.bytes.byteLength,
            contentHash,
            signal,
          );
        }
      } catch (error) {
        if (error instanceof ExternalFailure) throw error;
        throw externalFailure(error, signal);
      }

      return Object.freeze({
        contentHash,
        objectKey,
        byteLength: input.bytes.byteLength,
        mediaType: input.mediaType,
      });
    };
    return input.sourceListingId && this.#lifecycle?.withSyntheticUpload
      ? this.#lifecycle.withSyntheticUpload(
          { objectKey, sourceId: input.sourceId, sourceListingId: input.sourceListingId },
          signal,
          upload,
        )
      : upload();
  }

  /** Reads an immutable object for integrity checks without exposing the provider SDK. */
  public async read(objectKey: string, signal: AbortSignal): Promise<Uint8Array> {
    if (signal.aborted) throw externalFailure(signal.reason, signal, 'raw-snapshot.read');
    if (objectKey.startsWith('real/')) {
      const lifecycle = this.#realLifecycle();
      if (!this.#codec)
        throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.read' });
      const result = await lifecycle.withGeneration(objectKey, signal, async (generation) => {
        this.#assertAccessible(generation, true);
        const bytes = this.#codec!.decrypt(
          await this.#readCiphertext(objectKey, signal),
          generation,
        );
        this.#assertAccessible(generation, true);
        signal.throwIfAborted();
        return { generation, bytes };
      });
      // COMMIT and lease release can cross the deadline or cancellation after the callback.
      if (signal.aborted) throw externalFailure(signal.reason, signal, 'raw-snapshot.read');
      this.#assertAccessible(result.generation, true);
      return result.bytes;
    }

    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
        { abortSignal: signal },
      );
      if (result.Body === undefined) {
        throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.read' });
      }
      return Uint8Array.from(await result.Body.transformToByteArray());
    } catch (error) {
      if (error instanceof ExternalFailure) throw error;
      throw externalFailure(error, signal, 'raw-snapshot.read');
    }
  }

  #realLifecycle(): SnapshotLifecycle {
    if (!this.#lifecycle)
      throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.lifecycle' });
    return this.#lifecycle;
  }

  #assertAccessible(generation: SnapshotGeneration, requireAvailable: boolean): void {
    if (
      generation.suppressed ||
      generation.deleted ||
      (requireAvailable && !generation.available) ||
      Date.parse(this.#clock.now()) >= Date.parse(generation.expiresAt)
    )
      throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.expired' });
  }

  async #readCiphertext(objectKey: string, signal: AbortSignal): Promise<Uint8Array> {
    try {
      const result = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
        { abortSignal: signal },
      );
      if (!result.Body)
        throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.read' });
      const bytes = await result.Body.transformToByteArray();
      signal.throwIfAborted();
      return bytes;
    } catch (error) {
      if (error instanceof ExternalFailure) throw error;
      throw externalFailure(error, signal, 'raw-snapshot.read');
    }
  }

  async #storeReal(input: StoreRawSnapshotInput, signal: AbortSignal): Promise<StoredRawSnapshot> {
    const lifecycle = this.#realLifecycle();
    if (
      !this.#codec ||
      !input.acquisitionId ||
      !input.sourceListingId ||
      input.bytes.byteLength === 0 ||
      input.bytes.byteLength > 1_048_576
    )
      throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.store' });
    try {
      assertSnapshotIdentifier(input.sourceId);
      parseCollectionSourceListingId(input.sourceListingId);
      // Reject callers that bypass the application sanitizer; never upload their bytes.
      const listing = sanitizeSnapshotListing(
        JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.bytes)),
      );
      if (!Buffer.from(input.bytes).equals(Buffer.from(JSON.stringify(listing))))
        throw new TypeError('Snapshot is not canonical sanitized JSON.');
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.store' });
    }
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    const contentHash = parseSha256Hash(`sha256:${digest}`);
    const acquisitionScope = createHash('sha256').update(input.acquisitionId).digest('hex');
    const objectKey = `real/${acquisitionScope}/sha256/${digest}.aead`;
    await lifecycle.reserve(
      {
        acquisitionScope,
        sourceId: input.sourceId,
        sourceListingId: input.sourceListingId,
        objectKey,
        contentHash,
        byteLength: input.bytes.byteLength,
        mediaType: input.mediaType,
        keyId: this.#codec.keyId,
        collectedAt: this.#clock.now(),
      },
      signal,
    );
    return lifecycle.withGeneration(objectKey, signal, async (generation, transaction) => {
      this.#assertAccessible(generation, false);
      try {
        await this.#ensureBucket(signal);
        const ciphertext = this.#codec!.encrypt(input.bytes, generation);
        try {
          await this.#client.send(
            new PutObjectCommand({
              Bucket: this.#bucket,
              Key: objectKey,
              Body: ciphertext,
              ContentLength: ciphertext.byteLength,
              ContentType: 'application/octet-stream',
              IfNoneMatch: '*',
              Metadata: { 'rei-content-hash': contentHash, 'rei-key-id': generation.keyId },
            }),
            { abortSignal: signal },
          );
        } catch (error) {
          if (!isPreconditionFailure(error)) throw error;
          this.#codec!.decrypt(await this.#readCiphertext(objectKey, signal), generation);
        }
        this.#assertAccessible(generation, false);
        signal.throwIfAborted();
        await lifecycle.markAvailable(transaction, objectKey);
        return {
          contentHash,
          objectKey,
          byteLength: input.bytes.byteLength,
          mediaType: input.mediaType,
        };
      } catch (error) {
        if (error instanceof ExternalFailure) throw error;
        throw externalFailure(error, signal);
      }
    });
  }

  /** Only expired real generations are deleted; historical metadata is retained. */
  public async delete(objectKey: string, signal: AbortSignal): Promise<void> {
    const lifecycle = this.#realLifecycle();
    if (objectKey.startsWith('synthetic/')) {
      if (!lifecycle.deleteSynthetic)
        throw new ExternalFailure({ kind: 'forbidden', operation: 'raw-snapshot.delete' });
      return lifecycle.deleteSynthetic(
        objectKey,
        signal,
        async () => {
          await this.#client.send(
            new DeleteObjectCommand({ Bucket: this.#bucket, Key: objectKey }),
            { abortSignal: signal },
          );
        },
        new Date(Date.parse(this.#clock.now()) + this.#reconciliationIntervalMs).toISOString(),
      );
    }
    await lifecycle.withGeneration(objectKey, signal, async (generation, transaction) => {
      if (
        !generation.suppressed &&
        Date.parse(this.#clock.now()) < Date.parse(generation.expiresAt)
      )
        throw new ExternalFailure({ kind: 'rejected', operation: 'raw-snapshot.delete' });
      try {
        await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: objectKey }), {
          abortSignal: signal,
        });
        signal.throwIfAborted();
        await lifecycle.markDeleted(
          transaction,
          objectKey,
          new Date(Date.parse(this.#clock.now()) + this.#reconciliationIntervalMs).toISOString(),
        );
      } catch (error) {
        if (error instanceof ExternalFailure) throw error;
        throw externalFailure(error, signal, 'raw-snapshot.delete');
      }
    });
  }

  public destroy(): void {
    this.#client.destroy();
  }
}
