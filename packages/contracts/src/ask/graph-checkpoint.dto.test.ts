import { describe, expect, it } from 'vitest';
import { parseCheckpointRequest, parseCheckpointResponse } from './graph-checkpoint.dto.js';

const id = '0199bd4a-1111-7111-8111-111111111111';
const address = {
  version: 1,
  eventId: id,
  runId: id,
  threadId: id,
  executionId: id,
  graphVersion: 'price-v1',
  namespace: '',
};
describe('closed checkpoint wire', () => {
  it('accepts the installed UUID6 START clock sequence without relaxing domain UUIDv7 identity', () => {
    const vendorId = '1f1c5bc5-fc64-6970-ffff-662450d05835';
    expect(
      parseCheckpointRequest({ ...address, operation: 'get', checkpointId: vendorId }).operation,
    ).toBe('get');
    for (const key of ['eventId', 'runId', 'threadId', 'executionId'])
      expect(() =>
        parseCheckpointRequest({
          ...address,
          [key]: vendorId,
          operation: 'get',
          checkpointId: null,
        }),
      ).toThrow();
  });
  it('admits exact decoded checkpoint and metadata limits and rejects one byte over', () => {
    const request = {
      ...address,
      operation: 'put',
      checkpointId: id,
      parentId: null,
      checkpoint: { type: 'bytes', base64: Buffer.alloc(262144).toString('base64') },
      metadata: { type: 'bytes', base64: Buffer.alloc(4096).toString('base64') },
    };
    expect(parseCheckpointRequest(request).operation).toBe('put');
    expect(() =>
      parseCheckpointRequest({
        ...request,
        metadata: { type: 'bytes', base64: Buffer.alloc(4097).toString('base64') },
      }),
    ).toThrow();
  });
  it('enforces list, write count, reserved-slot and whole request limits', () => {
    for (const limit of [0, 21, 1.5])
      expect(() =>
        parseCheckpointRequest({ ...address, operation: 'list', beforeId: null, limit }),
      ).toThrow();
    const write = { index: 0, channel: 'input', value: { type: 'json', base64: 'e30=' } };
    const request = {
      ...address,
      operation: 'put-writes',
      checkpointId: id,
      taskId: 'task',
      writes: Array.from({ length: 32 }, () => write),
    };
    expect(parseCheckpointRequest(request).operation).toBe('put-writes');
    expect(() =>
      parseCheckpointRequest({ ...request, writes: [...request.writes, write] }),
    ).toThrow();
    expect(() =>
      parseCheckpointRequest({ ...request, writes: [{ ...write, index: -1 }] }),
    ).toThrow();
    expect(
      parseCheckpointRequest({
        ...request,
        writes: [{ ...write, index: -1, channel: '__error__' }],
      }).operation,
    ).toBe('put-writes');
    expect(() =>
      parseCheckpointRequest({
        ...request,
        writes: Array.from({ length: 3 }, () => ({
          ...write,
          value: { type: 'bytes', base64: Buffer.alloc(262144).toString('base64') },
        })),
      }),
    ).toThrow();
  });
  it('accepts empty namespace/latest and refuses authority in its body', () => {
    const request = { ...address, operation: 'get', checkpointId: null };
    expect(parseCheckpointRequest(request)).toEqual(request);
    expect(() => parseCheckpointRequest({ ...request, checkpointGrant: 'a'.repeat(43) })).toThrow();
  });
  it('validates operation fields and canonical bounded serialized values', () => {
    const request = {
      ...address,
      operation: 'put',
      checkpointId: id,
      parentId: null,
      checkpoint: { type: 'json', base64: 'e30=' },
      metadata: { type: 'json', base64: 'e30=' },
    };
    expect(parseCheckpointRequest(request)).toEqual(request);
    for (const base64 of ['e30', '!!!!', 'e31=', Buffer.alloc(262145).toString('base64')])
      expect(() =>
        parseCheckpointRequest({ ...request, checkpoint: { type: 'json', base64 } }),
      ).toThrow();
    expect(() => parseCheckpointRequest({ ...request, parentId: 'bad' })).toThrow();
    expect(() => parseCheckpointRequest({ ...request, namespace: '/foreign' })).toThrow();
  });
  it('refuses missing, extra and mismatched response fields', () => {
    expect(parseCheckpointResponse({ operation: 'get', record: null })).toEqual({
      operation: 'get',
      record: null,
    });
    for (const value of [
      { operation: 'get', saved: true },
      { operation: 'put', saved: false },
      { operation: 'list', records: [], record: null },
    ])
      expect(() => parseCheckpointResponse(value)).toThrow();
  });
});
