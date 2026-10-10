import {
  BucketAlreadyExists,
  BucketAlreadyOwnedByYou,
  CreateBucketCommand,
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
} from '@rei/application';
import { parseSha256Hash } from '@rei/domain';
import { createHash } from 'node:crypto';

export interface S3RawSnapshotStoreConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
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

  public constructor(config: S3RawSnapshotStoreConfig) {
    this.#bucket = config.bucket;
    this.#client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      maxAttempts: 1,
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
    const digest = createHash('sha256').update(input.bytes).digest('hex');
    const contentHash = parseSha256Hash(`sha256:${digest}`);
    const objectKey = `synthetic/sha256/${digest}.json`;

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
  }

  /** Reads an immutable object for integrity checks without exposing the provider SDK. */
  public async read(objectKey: string, signal: AbortSignal): Promise<Uint8Array> {
    if (signal.aborted) throw externalFailure(signal.reason, signal, 'raw-snapshot.read');

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

  public destroy(): void {
    this.#client.destroy();
  }
}
