import {
  invalidWire,
  parseWire,
  wireEnum,
  wireNullable,
  wireNumber,
  wireObject,
  wirePattern,
  wireUuid,
  wireDiscriminated,
  type WireValidator,
} from '../shared/wire.js';

// Independent primitive transport shapes; no domain or SDK dependency.
export interface CheckpointBytes {
  readonly type: 'json' | 'bytes';
  readonly base64: string;
}
export interface CheckpointAddress {
  readonly version: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly threadId: string;
  readonly executionId: string;
  readonly graphVersion: 'price-v1';
  readonly namespace: string;
}
export interface CheckpointWrite {
  readonly index: number;
  readonly channel: string;
  readonly value: CheckpointBytes;
}
export type CheckpointOperation =
  | { readonly operation: 'get'; readonly checkpointId: string | null }
  | { readonly operation: 'list'; readonly beforeId: string | null; readonly limit: number }
  | {
      readonly operation: 'put';
      readonly checkpointId: string;
      readonly parentId: string | null;
      readonly checkpoint: CheckpointBytes;
      readonly metadata: CheckpointBytes;
    }
  | {
      readonly operation: 'put-writes';
      readonly checkpointId: string;
      readonly taskId: string;
      readonly writes: readonly CheckpointWrite[];
    };
export type CheckpointRequest = CheckpointAddress & CheckpointOperation;
export interface CheckpointRecord {
  readonly checkpointId: string;
  readonly parentId: string | null;
  readonly checkpoint: CheckpointBytes;
  readonly metadata: CheckpointBytes;
  readonly pendingWrites: readonly (CheckpointWrite & { readonly taskId: string })[];
}
export type CheckpointResponse =
  | { readonly operation: 'get'; readonly record: CheckpointRecord | null }
  | { readonly operation: 'list'; readonly records: readonly CheckpointRecord[] }
  | { readonly operation: 'put' | 'put-writes'; readonly saved: true };

// Installed LangGraph emits UUID6(-1) with an ffff clock sequence for START.
const checkpointId = wirePattern(
  /^[0-9a-f]{8}-[0-9a-f]{4}-(?:6[0-9a-f]{3}-[0-9a-f]{4}|7[0-9a-f]{3}-[89ab][0-9a-f]{3})-[0-9a-f]{12}$/,
);
const identifier =
  (max: number, empty = false): WireValidator =>
  (value) => {
    if (
      typeof value !== 'string' ||
      value.length > max ||
      (!empty && value.length === 0) ||
      !/^[A-Za-z0-9_.:|<>-]*$/.test(value)
    )
      invalidWire();
  };
const bytes = (maximum: number) =>
  wireObject({
    type: wireEnum(['json', 'bytes']),
    base64: (value) => {
      if (
        typeof value !== 'string' ||
        value.length > Math.ceil(maximum / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
      )
        invalidWire();
      // Canonical padding bits and length, without depending on Node in browser contracts.
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
      if (
        (value.length / 4) * 3 - padding > maximum ||
        (padding &&
          (alphabet.indexOf(value[value.length - padding - 1]!) & (padding === 2 ? 15 : 3)) !== 0)
      )
        invalidWire();
    },
  });
const boundedArray =
  (validator: WireValidator, max: number): WireValidator =>
  (value) => {
    if (!Array.isArray(value) || value.length > max) invalidWire();
    for (const item of value) validator(item);
  };
const writeFields = {
  index: wireNumber(-4, 31, true),
  channel: identifier(128),
  value: bytes(262144),
};
const write: WireValidator = (value) => {
  wireObject(writeFields)(value);
  const slot = value as CheckpointWrite;
  const special: Readonly<Record<string, number>> = {
    __error__: -1,
    __scheduled__: -2,
    __interrupt__: -3,
    __resume__: -4,
  };
  if (slot.index < 0 && special[slot.channel] !== slot.index) invalidWire();
};
const pendingWrite: WireValidator = (value) => {
  wireObject({ ...writeFields, taskId: identifier(128) })(value);
  const item = value as CheckpointWrite & { readonly taskId: string };
  write({ index: item.index, channel: item.channel, value: item.value });
};
const record = wireObject({
  checkpointId,
  parentId: wireNullable(checkpointId),
  checkpoint: bytes(262144),
  metadata: bytes(4096),
  pendingWrites: boundedArray(pendingWrite, 1024),
});
const address = {
  version: wireEnum([1]),
  eventId: wireUuid,
  runId: wireUuid,
  threadId: wireUuid,
  executionId: wireUuid,
  graphVersion: wireEnum(['price-v1']),
  namespace: identifier(256, true),
};
function size(value: unknown, max: number): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    invalidWire();
  }
  if (serialized === undefined) invalidWire();
  let length = 0;
  for (const character of serialized) {
    const code = character.codePointAt(0)!;
    length += code <= 127 ? 1 : code <= 2047 ? 2 : code <= 65535 ? 3 : 4;
    if (length > max) invalidWire();
  }
}
export function parseCheckpointRequest(value: unknown): CheckpointRequest {
  size(value, 786432);
  return parseWire(
    value,
    wireDiscriminated('operation', {
      get: wireObject({
        ...address,
        operation: wireEnum(['get']),
        checkpointId: wireNullable(checkpointId),
      }),
      list: wireObject({
        ...address,
        operation: wireEnum(['list']),
        beforeId: wireNullable(checkpointId),
        limit: wireNumber(1, 20, true),
      }),
      put: wireObject({
        ...address,
        operation: wireEnum(['put']),
        checkpointId,
        parentId: wireNullable(checkpointId),
        checkpoint: bytes(262144),
        metadata: bytes(4096),
      }),
      'put-writes': wireObject({
        ...address,
        operation: wireEnum(['put-writes']),
        checkpointId,
        taskId: identifier(128),
        writes: boundedArray(write, 32),
      }),
    }),
  );
}
export function parseCheckpointRecord(value: unknown): CheckpointRecord {
  size(value, 8388608);
  const parsed = parseWire<CheckpointRecord>(value, record);
  size(parsed.pendingWrites, 1048576);
  return parsed;
}
export function parseCheckpointResponse(value: unknown): CheckpointResponse {
  size(value, 8388608);
  const parsed = parseWire<CheckpointResponse>(
    value,
    wireDiscriminated('operation', {
      get: wireObject({ operation: wireEnum(['get']), record: wireNullable(record) }),
      list: wireObject({ operation: wireEnum(['list']), records: boundedArray(record, 20) }),
      put: wireObject({ operation: wireEnum(['put']), saved: wireEnum([true]) }),
      'put-writes': wireObject({ operation: wireEnum(['put-writes']), saved: wireEnum([true]) }),
    }),
  );
  if (parsed.operation === 'get' && parsed.record) parseCheckpointRecord(parsed.record);
  if (parsed.operation === 'list') for (const item of parsed.records) parseCheckpointRecord(item);
  return parsed;
}
