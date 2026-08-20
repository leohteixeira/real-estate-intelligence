/** Process configuration, read once at start up from the environment. */
export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly intervalMs: number;
}

const DEFAULT_INTERVAL_MS = 30_000;

export function readConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. See env.example.');
  }

  const raw = env.WORKER_INTERVAL_MS?.trim();
  const intervalMs = raw ? Number.parseInt(raw, 10) : DEFAULT_INTERVAL_MS;

  if (!Number.isInteger(intervalMs) || intervalMs < 1_000) {
    throw new Error(`WORKER_INTERVAL_MS must be at least 1000, got ${String(raw)}.`);
  }

  return { databaseUrl, intervalMs };
}
