/** Values that can cross the HTTP boundary without custom serialization. */
export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

/** Recursively retains the JSON-compatible shape of an ordinary contract type. */
export type JsonCompatible<T> = T extends JsonPrimitive
  ? T
  : T extends (...arguments_: never[]) => unknown
    ? never
    : T extends readonly (infer TItem)[]
      ? readonly JsonCompatible<TItem>[]
      : T extends object
        ? { readonly [TKey in keyof T]: JsonCompatible<T[TKey]> }
        : never;
