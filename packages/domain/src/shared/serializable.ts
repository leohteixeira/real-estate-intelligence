export type SerializablePrimitive = string | number | boolean | null;

export type SerializableValue =
  | SerializablePrimitive
  | readonly SerializableValue[]
  | { readonly [key: string]: SerializableValue };

export type EventPayload = Readonly<Record<string, SerializableValue>>;

function isPlainObject(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSerializableDenseArray(
  value: readonly unknown[],
  ancestors: ReadonlySet<object>,
): boolean {
  if (Object.keys(value).length !== value.length) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      !isSerializableValueAt(descriptor.value, ancestors)
    ) {
      return false;
    }
  }

  return true;
}

function hasSerializableEnumerableDataProperties(
  value: object,
  ancestors: ReadonlySet<object>,
): boolean {
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) =>
      !descriptor.enumerable ||
      ('value' in descriptor && isSerializableValueAt(descriptor.value, ancestors)),
  );
}

function isSerializableValueAt(value: unknown, ancestors: ReadonlySet<object>): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }

  if (typeof value !== 'object' || ancestors.has(value)) {
    return false;
  }

  const nextAncestors = new Set(ancestors).add(value);
  if (Array.isArray(value)) {
    return (
      Object.getPrototypeOf(value) === Array.prototype &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      isSerializableDenseArray(value, nextAncestors)
    );
  }

  return (
    isPlainObject(value) &&
    Object.getOwnPropertySymbols(value).length === 0 &&
    hasSerializableEnumerableDataProperties(value, nextAncestors)
  );
}

/** True only for a finite JSON value made from primitives, dense arrays and plain objects. */
export function isSerializableValue(value: unknown): value is SerializableValue {
  return isSerializableValueAt(value, new Set());
}

/** True only for an object whose complete graph is a finite JSON value. */
export function isSerializableEventPayload(value: unknown): value is EventPayload {
  return isPlainObjectValue(value) && isSerializableValue(value);
}

function isPlainObjectValue(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && isPlainObject(value)
  );
}

/** Clones and deeply freezes a value after it has passed serializability validation. */
export function immutableSerializableValue<TValue extends SerializableValue>(
  value: TValue,
): TValue {
  if (Array.isArray(value)) {
    const clone: SerializableValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError('Serializable arrays must contain only indexed data properties.');
      }
      clone.push(immutableSerializableValue(descriptor.value));
    }
    return Object.freeze(clone) as TValue;
  }

  if (typeof value === 'object' && value !== null) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, immutableSerializableValue(item)]),
      ),
    ) as TValue;
  }

  return value;
}
