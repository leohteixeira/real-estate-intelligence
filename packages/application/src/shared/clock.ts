export const CLOCK = Symbol.for('rei.Clock');

/** Supplies an RFC 3339 timestamp without coupling use cases to the system clock. */
export interface Clock {
  now(): string;
}
