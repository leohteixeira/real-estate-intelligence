/** Closed JSON shape validators; all calculations remain outside contracts. */
export type WireValidator = (value: unknown) => void;

export function invalidWire(): never {
  throw new TypeError('Invalid contract value.');
}
export const wireString: WireValidator = (value) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > 20000) invalidWire();
};
export const wireBoolean: WireValidator = (value) => {
  if (typeof value !== 'boolean') invalidWire();
};
export const wireNull: WireValidator = (value) => {
  if (value !== null) invalidWire();
};
export function wireEnum(values: readonly unknown[]): WireValidator {
  return (value) => {
    if (!values.includes(value)) invalidWire();
  };
}
export function wireNumber(min = 0, max = Number.MAX_SAFE_INTEGER, integer = false): WireValidator {
  return (value) => {
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isSafeInteger(value))
    )
      invalidWire();
  };
}
export const wireCount = wireNumber(0, Number.MAX_SAFE_INTEGER, true);
export const wireMoney = wireNumber(1, Number.MAX_SAFE_INTEGER, true);
export function wirePattern(pattern: RegExp): WireValidator {
  return (value) => {
    wireString(value);
    if (!pattern.test(value as string)) invalidWire();
  };
}
export const wireUuid = wirePattern(
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);
export const wireSlug = wirePattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const wireHash = wirePattern(/^sha256:[0-9a-f]{64}$/);
export const wireDate: WireValidator = (value) => {
  wireString(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value as string) ||
    !Number.isFinite(Date.parse(value as string)) ||
    new Date(value as string).toISOString() !== value
  )
    invalidWire();
};
export const wireUrl: WireValidator = (value) => {
  wireString(value);
  const RuntimeUrl = Reflect.get(globalThis, 'URL') as new (input: string) => {
    protocol: string;
    username: string;
    password: string;
  };
  let url;
  try {
    url = new RuntimeUrl(value as string);
  } catch {
    return invalidWire();
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) invalidWire();
};
export function wireNullable(validator: WireValidator): WireValidator {
  return (value) => {
    if (value !== null) validator(value);
  };
}
export function wireArray(validator: WireValidator): WireValidator {
  return (value) => {
    if (!Array.isArray(value) || value.length > 10000) invalidWire();
    for (const item of value) validator(item);
  };
}
export function wireObject(fields: Readonly<Record<string, WireValidator>>): WireValidator {
  return (value) => {
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    )
      invalidWire();
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object);
    if (keys.length !== Object.keys(fields).length || keys.some((key) => !(key in fields)))
      invalidWire();
    for (const [key, validator] of Object.entries(fields)) validator(object[key]);
  };
}
export function wireDiscriminated(
  key: string,
  variants: Readonly<Record<string, WireValidator>>,
): WireValidator {
  return (value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidWire();
    const tag = (value as Record<string, unknown>)[key];
    if (typeof tag !== 'string' || !Object.hasOwn(variants, tag)) invalidWire();
    variants[tag]!(value);
  };
}
export function parseWire<T>(value: unknown, validator: WireValidator): T {
  validator(value);
  return value as T;
}
