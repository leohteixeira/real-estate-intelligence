/** Process configuration, read once at start up from the environment. */
export interface WorkerConfig {
  readonly databaseUrl: string;
  readonly rabbitMqUrl: string;
  readonly intervalMs: number;
  readonly relayIntervalMs: number;
  readonly relayBatchSize: number;
  readonly claimLeaseMs: number;
  readonly reconnectIntervalMs: number;
  readonly operationTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_RELAY_INTERVAL_MS = 1_000;
const DEFAULT_RELAY_BATCH_SIZE = 25;
const DEFAULT_CLAIM_LEASE_MS = 130_000;
const DEFAULT_RECONNECT_INTERVAL_MS = 1_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 5_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[name]?.trim();
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

export function readConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. See env.example.');
  }

  const rabbitMqUrl = env.RABBITMQ_URL?.trim();
  if (!rabbitMqUrl) {
    throw new Error('RABBITMQ_URL is required. See env.example.');
  }

  const raw = env.WORKER_INTERVAL_MS?.trim();
  const intervalMs = raw ? Number.parseInt(raw, 10) : DEFAULT_INTERVAL_MS;

  if (!Number.isInteger(intervalMs) || intervalMs < 1_000) {
    throw new Error(`WORKER_INTERVAL_MS must be at least 1000, got ${String(raw)}.`);
  }

  const operationTimeoutMs = positiveInteger(
    env,
    'WORKER_OPERATION_TIMEOUT_MS',
    DEFAULT_OPERATION_TIMEOUT_MS,
    100,
  );
  const shutdownTimeoutMs = positiveInteger(
    env,
    'SHUTDOWN_TIMEOUT_MS',
    DEFAULT_SHUTDOWN_TIMEOUT_MS,
    operationTimeoutMs,
  );

  const relayIntervalMs = positiveInteger(
    env,
    'OUTBOX_RELAY_INTERVAL_MS',
    DEFAULT_RELAY_INTERVAL_MS,
    100,
  );
  const relayBatchSize = positiveInteger(
    env,
    'OUTBOX_RELAY_BATCH_SIZE',
    DEFAULT_RELAY_BATCH_SIZE,
    1,
    100,
  );
  const claimLeaseMs = positiveInteger(
    env,
    'OUTBOX_CLAIM_LEASE_MS',
    DEFAULT_CLAIM_LEASE_MS,
    100,
    86_400_000,
  );
  const minimumClaimLeaseMs = relayBatchSize * operationTimeoutMs + relayIntervalMs;
  if (claimLeaseMs < minimumClaimLeaseMs) {
    throw new Error(
      `OUTBOX_CLAIM_LEASE_MS must be at least ${minimumClaimLeaseMs} for the configured batch.`,
    );
  }
  const reconnectIntervalMs = positiveInteger(
    env,
    'RABBITMQ_RECONNECT_INTERVAL_MS',
    DEFAULT_RECONNECT_INTERVAL_MS,
    100,
    shutdownTimeoutMs,
  );

  return {
    databaseUrl,
    rabbitMqUrl,
    intervalMs,
    relayIntervalMs,
    relayBatchSize,
    claimLeaseMs,
    reconnectIntervalMs,
    operationTimeoutMs,
    shutdownTimeoutMs,
  };
}
