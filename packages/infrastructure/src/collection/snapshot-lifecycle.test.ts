import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  ExternalFailure,
  ExpireSnapshots,
  SNAPSHOT_RETENTION_MS,
  type SnapshotGeneration,
  type StoreRawSnapshotInput,
} from '@rei/application';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanonicalSnapshotSanitizer } from './canonical-snapshot-sanitizer.js';
import { InMemorySnapshotLifecycle } from './in-memory-snapshot-lifecycle.js';
import { PostgresSnapshotLifecycle } from './postgres-snapshot-lifecycle.js';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { S3RawSnapshotStore } from './s3-raw-snapshot-store.js';
import { SnapshotAeadCodec } from './snapshot-aead-codec.js';
import { SYNTHETIC_LISTING_BYTES } from './synthetic-listing-source.js';

const encryption = { keyId: 'fixture-key', keyBase64: Buffer.alloc(32, 7).toString('base64') };
const original = {
  ...JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
  advertiser: {
    type: 'private',
    agencyName: 'Maria Private',
    name: 'Maria Private',
    phone: '11999998888',
    cpf: '123.456.789-01',
    creci: '12345-F',
  },
  location: {
    city: 'São Paulo',
    stateCode: 'SP',
    neighborhood: 'Centro',
    street: 'Rua Exemplo',
    unit: 'secret-unit',
  },
  maskedDescription:
    'Maria Private offers an apartment. mail@example.test +55 (11) 99999-8888 123.456.789-01 https://contact.invalid CRECI-SP 12345-F +1 (202) 555-0123 +33 (0)1 23 45 67 89 / 01 23 45 67 89 Beatriz Confidential CRECI nº 12345-F CRECI n° 12345-F CRECI: 123.456-F 06.12.34.56.78 +33 6.12.34.56.78 CRECI N.º 12345-F CRECI n°: 12345-F 0800 123 4567 0800-123-4567 +34 612 345 678 +351 912 345 678 CRECI (SP) 12345-F CRECI Nº. 54321-F',
  imageFingerprints: [`sha256:${'a'.repeat(64)}`],
  photos: ['secret-photo'],
  contact: { firstName: 'Beatriz', lastName: 'Confidential' },
  unknown: 'secret-unknown',
};
const document = {
  sourceId: 'privacy-fixture',
  sourceListingId: 'listing-1',
  sourceUrl: 'https://fixture.invalid/listings/1?email=mail@example.test#Maria',
  observedAt: '2026-10-10T00:00:00.000Z',
  mediaType: 'application/json' as const,
  bytes: Buffer.from(JSON.stringify(original)),
};
const sanitized = new CanonicalSnapshotSanitizer().sanitize(document);
const input: StoreRawSnapshotInput = {
  sourceId: document.sourceId,
  synthetic: false,
  acquisitionId: 'operation-1',
  mediaType: 'application/json',
  bytes: sanitized.document.bytes,
};
const config = {
  endpoint: 'http://fixture.invalid',
  region: 'fixture',
  bucket: 'fixture',
  accessKeyId: 'fixture',
  secretAccessKey: 'fixture',
};

function fixture() {
  let now = Date.parse('2026-10-10T00:00:00.000Z');
  const lifecycle = new InMemorySnapshotLifecycle();
  const objects = new Map<string, Uint8Array>();
  const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (
    command: unknown,
  ) => {
    if (command instanceof HeadBucketCommand) return {};
    if (command instanceof PutObjectCommand) {
      const key = command.input.Key!;
      if (objects.has(key)) throw { $metadata: { httpStatusCode: 412 } };
      objects.set(key, Uint8Array.from(command.input.Body as Uint8Array));
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const bytes = objects.get(command.input.Key!);
      if (!bytes) throw { $metadata: { httpStatusCode: 404 } };
      return { Body: { transformToByteArray: async () => Uint8Array.from(bytes) } };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key!);
      return {};
    }
    throw new Error('Unexpected object command.');
  }) as never);
  const clock = { now: () => new Date(now).toISOString() };
  const store = new S3RawSnapshotStore({ ...config, encryption, lifecycle, clock });
  return {
    store,
    objects,
    lifecycle,
    send,
    clock,
    advance: (value: number) => {
      now += value;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('canonical snapshot sanitizer', () => {
  it('sanitizes bytes, provenance and hostile parser output without losing facts', () => {
    const text =
      JSON.stringify(sanitized.document) +
      new TextDecoder().decode(sanitized.document.bytes) +
      JSON.stringify(sanitized.sanitizeParsed(original));
    for (const forbidden of [
      'Maria Private',
      'mail@example.test',
      '99999',
      '123.456',
      'secret-',
      'contact.invalid',
      '12345-F',
      'CRECI-SP',
      '+1 (202) 555-0123',
      '555-0123',
      '+33 (0)1 23 45 67 89',
      '01 23 45 67 89',
      '23 45 67 89',
      'Beatriz',
      'Confidential',
      'CRECI nº',
      'CRECI n°',
      '456-F',
      '06.12.34.56.78',
      '+33 6.12.34.56.78',
      '6.12.34.56.78',
      'CRECI N.º',
      'CRECI n°:',
      '0800 123 4567',
      '0800-123-4567',
      '+34 612 345 678',
      '+351 912 345 678',
      'CRECI (SP)',
      'CRECI Nº.',
      '54321-F',
    ])
      expect(text).not.toContain(forbidden);
    expect(sanitized.document.sourceUrl).toBe('https://fixture.invalid/listings/1');
    expect(sanitized.sanitizeParsed(original).areaSquareMeters).toBe(82.5);
    expect(
      sanitized.sanitizeParsed({
        ...original,
        name: 'Second Contact',
        maskedDescription:
          'Second Contact offers a home. CRECI-SP 12345-F +1 (202) 555-0123 +33 (0)1 23 45 67 89 / 01 23 45 67 89',
      }).maskedDescription,
    ).not.toContain('Second Contact');
    expect(JSON.stringify(sanitized.sanitizeParsed(original))).not.toContain('555-0123');
    const parserResult = sanitized.sanitizeParsed({
      ...original,
      contact: { firstName: 'Daniela', lastName: 'Restricted' },
      maskedDescription:
        'Daniela Restricted offers an apartment. CRECI: 123.456-F 06.12.34.56.78 +33 6.12.34.56.78 CRECI N.º 12345-F CRECI n°: 12345-F 0800 123 4567 0800-123-4567 +34 612 345 678 +351 912 345 678 CRECI (SP) 12345-F CRECI Nº. 54321-F',
    });
    for (const forbidden of [
      'Daniela',
      'Restricted',
      '456-F',
      '06.12.34.56.78',
      '+33 6.12.34.56.78',
      '6.12.34.56.78',
      'CRECI N.º',
      'CRECI n°:',
      '0800 123 4567',
      '0800-123-4567',
      '+34 612 345 678',
      '+351 912 345 678',
      'CRECI (SP)',
      'CRECI Nº.',
      '54321-F',
    ])
      expect(JSON.stringify(parserResult)).not.toContain(forbidden);
    expect(
      new CanonicalSnapshotSanitizer().sanitize({
        ...document,
        contact: 'secret-extra',
      } as typeof document).document,
    ).not.toHaveProperty('contact');
    expect(() => sanitized.sanitizeParsed({ ...original, location: null })).toThrow(
      ExternalFailure,
    );
  });
  it.each([
    { sourceListingId: 'mail@example.test' },
    { sourceUrl: 'https://person:password@fixture.invalid' },
    { sourceUrl: 'ftp://fixture.invalid/listing' },
    { sourceUrl: 'https://whatsapp.invalid/11999998888' },
    { sourceUrl: 'https://fixture.invalid/Maria%20Private' },
    { sourceUrl: 'https://fixture.invalid/%xx' },
    { observedAt: 'yesterday' },
    { mediaType: 'text/html' },
    { bytes: Buffer.from('<html>secret</html>') },
    { bytes: Buffer.from([255]) },
    { bytes: Buffer.alloc(1_048_577) },
  ])('fails closed for unsafe canonical documents without exposing values: %j', (override) => {
    expect(() =>
      new CanonicalSnapshotSanitizer().sanitize({ ...document, ...override } as typeof document),
    ).toThrow(ExternalFailure);
  });
});

describe('authenticated snapshot envelope', () => {
  const generation: SnapshotGeneration = {
    acquisitionScope: 'a'.repeat(64),
    sourceId: 'privacy-fixture',
    objectKey: 'real/fixture',
    contentHash: `sha256:${createHash('sha256').update(input.bytes).digest('hex')}`,
    byteLength: input.bytes.byteLength,
    mediaType: 'application/json',
    keyId: encryption.keyId,
    collectedAt: '2026-10-10T00:00:00.000Z',
    expiresAt: '2026-11-09T00:00:00.000Z',
    deleted: false,
    available: true,
  };
  it('uses unique nonces and authenticates plaintext and all bound identity fields', () => {
    const codec = new SnapshotAeadCodec(encryption);
    const one = codec.encrypt(input.bytes, generation);
    expect(codec.encrypt(input.bytes, generation)).not.toEqual(one);
    expect(codec.decrypt(one, generation)).toEqual(Buffer.from(input.bytes));
    for (const change of [
      { objectKey: 'real/swapped' },
      { contentHash: `sha256:${'0'.repeat(64)}` },
      { mediaType: 'text/html' },
      { keyId: 'unknown' },
      { byteLength: 3 },
    ])
      expect(() => codec.decrypt(one, { ...generation, ...change } as SnapshotGeneration)).toThrow(
        ExternalFailure,
      );
    expect(() =>
      new SnapshotAeadCodec({
        ...encryption,
        keyBase64: Buffer.alloc(32, 8).toString('base64'),
      }).decrypt(one, generation),
    ).toThrow(ExternalFailure);
  });
  it('rejects malformed envelopes, truncated tags, altered ciphertext and invalid configuration', () => {
    const codec = new SnapshotAeadCodec(encryption);
    const valid = JSON.parse(Buffer.from(codec.encrypt(input.bytes, generation)).toString());
    for (const envelope of [
      null,
      [],
      { ...valid, extra: true },
      { ...valid, version: 2 },
      { ...valid, nonce: 'bad' },
      { ...valid, tag: Buffer.alloc(15).toString('base64') },
      { ...valid, ciphertext: Buffer.alloc(4).toString('base64') },
      { ...valid, keyId: 'unknown' },
    ])
      expect(() => codec.decrypt(Buffer.from(JSON.stringify(envelope)), generation)).toThrow(
        ExternalFailure,
      );
    expect(() => codec.decrypt(Buffer.from('{'), generation)).toThrow(ExternalFailure);
    for (const change of [
      { keyId: 'unsafe key' },
      { keyBase64: 'bad' },
      { keyBase64: Buffer.alloc(31).toString('base64') },
    ])
      expect(() => new SnapshotAeadCodec({ ...encryption, ...change })).toThrow(ExternalFailure);
  });
});

describe('encrypted storage lifecycle', () => {
  it.each(['before-expiry', 'exact-expiry', 'cancelled'])(
    'rechecks access after the actual PostgreSQL transaction runner settles: %s',
    async (boundary) => {
      const f = fixture();
      const saved = await f.store.store(input, AbortSignal.timeout(1000));
      const generation = f.lifecycle.generations.get(saved.objectKey)!;
      const controller = new AbortController();
      const query = vi.fn(async (statement: string) => {
        if (statement === 'COMMIT') {
          f.advance(boundary === 'exact-expiry' ? 1 : 0);
        }
        if (statement.startsWith('SELECT'))
          return [
            {
              object_key: generation.objectKey,
              acquisition_scope: generation.acquisitionScope,
              source_id: generation.sourceId,
              content_hash: generation.contentHash,
              byte_length: generation.byteLength,
              media_type: generation.mediaType,
              key_id: generation.keyId,
              collected_at: new Date(generation.collectedAt),
              expires_at: new Date(generation.expiresAt),
              available: true,
              deleted: false,
            },
          ];
        return [];
      });
      const identity = {};
      const release = vi.fn(() => {
        if (boundary === 'cancelled') controller.abort();
      });
      const connection = {
        leaseClient: async () => ({ query, release }),
        transactionIdentity: () => identity,
      } as unknown as DatabaseConnection;
      const reader = new S3RawSnapshotStore({
        ...config,
        encryption,
        clock: f.clock,
        lifecycle: new PostgresSnapshotLifecycle(connection),
      });
      f.advance(SNAPSHOT_RETENTION_MS - 1);
      try {
        const read = reader.read(saved.objectKey, controller.signal);
        if (boundary === 'before-expiry')
          await expect(read).resolves.toEqual(Buffer.from(input.bytes));
        else
          await expect(read).rejects.toMatchObject(
            boundary === 'cancelled'
              ? { kind: 'cancelled', operation: 'raw-snapshot.read' }
              : { kind: 'rejected', operation: 'raw-snapshot.expired' },
          );
        expect(query).toHaveBeenLastCalledWith('COMMIT');
        expect(release).toHaveBeenCalledOnce();
      } finally {
        reader.destroy();
        f.store.destroy();
      }
    },
  );
  it.each([
    'CRECI-SP 12345-F',
    'CRECI nº 12345-F',
    'CRECI n° 12345-F',
    'CRECI: 123.456-F',
    'CRECI N.º 12345-F',
    'CRECI n°: 12345-F',
    'CRECI (SP) 12345-F',
    'CRECI Nº. 54321-F',
    '+1 (202) 555-0123',
    '+33 (0)1 23 45 67 89',
    '01 23 45 67 89',
    '06.12.34.56.78',
    '+33 6.12.34.56.78',
    '0800 123 4567',
    '0800-123-4567',
    '+34 612 345 678',
    '+351 912 345 678',
  ])('rejects canonical real bytes that bypass masking of %s', async (contact) => {
    const f = fixture();
    const unsafe = {
      ...JSON.parse(Buffer.from(input.bytes).toString()),
      maskedDescription: `Apartment with balcony. Contact ${contact}.`,
    };
    await expect(
      f.store.store(
        { ...input, bytes: Buffer.from(JSON.stringify(unsafe)) },
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(f.objects.size).toBe(0);
    expect(f.lifecycle.generations.size).toBe(0);
  });
  it('reserves before upload, converges concurrent attempts and authenticates winners', async () => {
    const f = fixture();
    const results = await Promise.all([
      f.store.store(input, AbortSignal.timeout(1000)),
      f.store.store(input, AbortSignal.timeout(1000)),
    ]);
    expect(results[0]).toEqual(results[1]);
    expect(f.objects.size).toBe(1);
    const bytes = f.objects.get(results[0]!.objectKey)!;
    expect(new TextDecoder().decode(bytes)).not.toContain('apartment');
    expect(await f.store.read(results[0]!.objectKey, AbortSignal.timeout(1000))).toEqual(
      Buffer.from(input.bytes),
    );
    f.objects.set(results[0]!.objectKey, Buffer.from('tampered'));
    await expect(f.store.store(input, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'rejected',
    });
    await expect(
      f.store.read(results[0]!.objectKey, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
  it('keeps independent acquisitions and immutable expiry, refusing reads and writes at the exact deadline', async () => {
    const f = fixture();
    const one = await f.store.store(input, AbortSignal.timeout(1000));
    f.advance(1);
    const two = await f.store.store(
      { ...input, acquisitionId: 'operation-2' },
      AbortSignal.timeout(1000),
    );
    expect(two.objectKey).not.toBe(one.objectKey);
    f.advance(SNAPSHOT_RETENTION_MS - 2);
    expect(await f.store.read(one.objectKey, AbortSignal.timeout(1000))).toEqual(
      Buffer.from(input.bytes),
    );
    await f.store.store(input, AbortSignal.timeout(1000));
    f.advance(1);
    await expect(f.store.read(one.objectKey, AbortSignal.timeout(1000))).rejects.toMatchObject({
      operation: 'raw-snapshot.expired',
    });
    await expect(f.store.store(input, AbortSignal.timeout(1000))).rejects.toMatchObject({
      operation: 'raw-snapshot.expired',
    });
    await f.store.delete(one.objectKey, AbortSignal.timeout(1000));
    await f.store.delete(one.objectKey, AbortSignal.timeout(1000));
    expect(f.objects.has(one.objectKey)).toBe(false);
    expect(f.objects.has(two.objectKey)).toBe(true);
    expect(f.lifecycle.generations.get(one.objectKey)?.contentHash).toBe(one.contentHash);
    await expect(f.store.delete(two.objectKey, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'rejected',
    });
  });
  it('keeps reserved orphans and resumes after delete-before-confirmation failure', async () => {
    const f = fixture();
    const confirmation = vi
      .spyOn(f.lifecycle, 'markAvailable')
      .mockRejectedValueOnce(new Error('commit failed'));
    await expect(f.store.store(input, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'transient',
    });
    expect(confirmation).toHaveBeenCalledOnce();
    const key = [...f.objects.keys()][0]!;
    await expect(f.store.read(key, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'rejected',
    });
    f.advance(SNAPSHOT_RETENTION_MS);
    const deletion = vi
      .spyOn(f.lifecycle, 'markDeleted')
      .mockRejectedValueOnce(new Error('crash after deleting'));
    await expect(f.store.delete(key, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'transient',
    });
    expect(f.objects.has(key)).toBe(false);
    expect(f.lifecycle.generations.get(key)?.deleted).toBe(false);
    await f.store.delete(key, AbortSignal.timeout(1000));
    expect(deletion).toHaveBeenCalledTimes(2);
    expect(f.lifecycle.generations.get(key)?.deleted).toBe(true);
  });
  it('advances bounded batches past tombstones and revisits them when their durable schedule is due', async () => {
    const f = fixture();
    const saved = await Promise.all(
      ['one', 'two', 'three', 'four', 'five'].map((acquisitionId) =>
        f.store.store({ ...input, acquisitionId }, AbortSignal.timeout(1000)),
      ),
    );
    const retention = new ExpireSnapshots(f.lifecycle, f.store, f.clock);
    f.advance(SNAPSHOT_RETENTION_MS);
    expect(await retention.expire(2, AbortSignal.timeout(1000))).toBe(2);
    expect(await retention.expire(2, AbortSignal.timeout(1000))).toBe(2);
    expect(await retention.expire(2, AbortSignal.timeout(1000))).toBe(1);
    expect(await retention.expire(2, AbortSignal.timeout(1000))).toBe(0);
    expect(f.objects.size).toBe(0);
    // A remote write can complete after an aborted client and confirmed deletion.
    f.objects.set(saved[0]!.objectKey, Buffer.from('late remote write'));
    await expect(
      f.store.read(saved[0]!.objectKey, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ kind: 'rejected' });
    f.advance(299_999);
    expect(await retention.expire(2, AbortSignal.timeout(1000))).toBe(0);
    f.advance(1);
    for (let batch = 0; batch < 3; batch++) await retention.expire(2, AbortSignal.timeout(1000));
    expect(f.objects.size).toBe(0);
    expect(
      [...f.lifecycle.generations.values()].every(
        (generation) => generation.deleted && !generation.available,
      ),
    ).toBe(true);
  });
  it('validates reconciliation intervals independently of worker configuration', () => {
    for (const reconciliationIntervalMs of [0, 99, 1.5, 2_147_483_648])
      expect(() => new S3RawSnapshotStore({ ...config, reconciliationIntervalMs })).toThrow(
        RangeError,
      );
  });
  it('advances size-one selections at a fixed clock past persistent failures and cancellation', async () => {
    const f = fixture();
    const saved = await Promise.all(
      ['one', 'two', 'three', 'four'].map((acquisitionId) =>
        f.store.store({ ...input, acquisitionId }, AbortSignal.timeout(1000)),
      ),
    );
    const keys = saved.map((snapshot) => snapshot.objectKey).sort();
    const failingKey = keys[0]!;
    const cancelledKey = keys[1]!;
    const originalDelete = f.store.delete.bind(f.store);
    let failing = true;
    const remove = vi
      .spyOn(f.store, 'delete')
      .mockImplementation(async (key, signal, deadlineAt) => {
        if (key === failingKey && failing)
          throw new ExternalFailure({ kind: 'transient', operation: 'raw-snapshot.delete' });
        await originalDelete(key, signal, deadlineAt);
      });
    const retention = new ExpireSnapshots(f.lifecycle, f.store, f.clock);
    f.advance(SNAPSHOT_RETENTION_MS);
    await expect(retention.expire(1, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'exhausted',
    });
    const selection = f.lifecycle.listExpired.bind(f.lifecycle);
    const controller = new AbortController();
    const list = vi.spyOn(f.lifecycle, 'listExpired').mockImplementationOnce(async (...args) => {
      const selected = await selection(...args);
      expect(selected).toEqual([cancelledKey]);
      controller.abort();
      return selected;
    });
    await expect(retention.expire(1, controller.signal)).rejects.toThrow();
    expect(remove).toHaveBeenCalledTimes(1);
    list.mockRestore();
    for (const expectedKey of keys.slice(2)) {
      expect(await retention.expire(1, AbortSignal.timeout(1000))).toBe(1);
      expect(f.objects.has(expectedKey)).toBe(false);
    }
    await expect(retention.expire(1, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'exhausted',
    });
    expect(await retention.expire(1, AbortSignal.timeout(1000))).toBe(1);
    expect(f.objects.has(cancelledKey)).toBe(false);
    expect(f.objects.has(failingKey)).toBe(true);
    expect(f.lifecycle.generations.get(failingKey)?.deleted).toBe(false);
    failing = false;
    expect(await retention.expire(1, AbortSignal.timeout(1000))).toBe(1);
    expect(f.objects.size).toBe(0);
    expect(await retention.expire(1, AbortSignal.timeout(1000))).toBe(0);
  });
  it('refuses missing keys, unsanitized bytes, changed acquisition content and unknown reads', async () => {
    const f = fixture();
    const missing = new S3RawSnapshotStore({ ...config, lifecycle: f.lifecycle });
    await expect(missing.store(input, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'forbidden',
    });
    await expect(missing.read('real/missing', AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'forbidden',
    });
    await expect(
      new S3RawSnapshotStore(config).store(input, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(
      f.store.store({ ...input, bytes: document.bytes }, AbortSignal.timeout(1000)),
    ).rejects.toMatchObject({ kind: 'rejected' });
    await f.store.store(input, AbortSignal.timeout(1000));
    await expect(
      f.store.store(
        {
          ...input,
          bytes: Buffer.from(
            JSON.stringify({
              ...JSON.parse(Buffer.from(input.bytes).toString()),
              askingPriceMinorUnits: 100,
            }),
          ),
        },
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    await expect(f.store.read('real/unknown', AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'rejected',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(f.store.store(input, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
  });
  it('maps storage outages and cancellations, retaining reservations for eventual cleanup', async () => {
    const f = fixture();
    f.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 403 } } as never);
    await expect(f.store.store(input, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(f.lifecycle.generations.size).toBe(1);
    const saved = await f.store.store(input, AbortSignal.timeout(1000));
    f.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 503 } } as never);
    await expect(f.store.read(saved.objectKey, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'transient',
    });
    f.advance(SNAPSHOT_RETENTION_MS);
    f.send.mockRejectedValueOnce({ $metadata: { httpStatusCode: 503 } } as never);
    await expect(f.store.delete(saved.objectKey, AbortSignal.timeout(1000))).rejects.toMatchObject({
      kind: 'transient',
    });
    expect(f.lifecycle.generations.get(saved.objectKey)?.deleted).toBe(false);
    await f.store.delete(saved.objectKey, AbortSignal.timeout(1000));
  });
});
