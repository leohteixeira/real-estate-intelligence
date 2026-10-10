/**
 * Port used by the readiness endpoint and by the worker to decide whether the
 * primary database can currently serve traffic.
 *
 * Declared by the consuming layer. The PostgreSQL adapter lives in
 * `@rei/infrastructure`, so no driver type ever crosses into the application or
 * the domain.
 */
export interface DatabaseAvailabilityProbe {
  /** Resolves to true when the database answered within the caller's signal. */
  isAvailable(signal: AbortSignal): Promise<boolean>;
}

/** Injection token, kept here so the adapter does not have to invent one. */
export const DATABASE_AVAILABILITY_PROBE = Symbol.for('rei.DatabaseAvailabilityProbe');
