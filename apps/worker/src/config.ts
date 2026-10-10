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
  readonly eventDeliveryLimit: number;
  readonly eventRedeliveryDelayMs: number;
  readonly outboxRetentionMs: number;
  readonly inboxRetentionMs: number;
  readonly retentionIntervalMs: number;
  readonly retentionBatchSize: number;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_RELAY_INTERVAL_MS = 1_000;
const DEFAULT_RELAY_BATCH_SIZE = 25;
const DEFAULT_CLAIM_LEASE_MS = 130_000;
const DEFAULT_RECONNECT_INTERVAL_MS = 1_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 5_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;
const DEFAULT_EVENT_DELIVERY_LIMIT = 5;
const DEFAULT_EVENT_REDELIVERY_DELAY_MS = 1_000;
const DEFAULT_OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_INBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const DEFAULT_RETENTION_INTERVAL_MS = 5 * 60 * 1_000;
const DEFAULT_RETENTION_BATCH_SIZE = 1_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function positiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const raw = env[name]?.trim();
  const value = raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Number.NaN : fallback;
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

  const intervalMs = positiveInteger(
    env,
    'WORKER_INTERVAL_MS',
    DEFAULT_INTERVAL_MS,
    1_000,
    MAX_TIMER_DELAY_MS,
  );

  const operationTimeoutMs = positiveInteger(
    env,
    'WORKER_OPERATION_TIMEOUT_MS',
    DEFAULT_OPERATION_TIMEOUT_MS,
    100,
    MAX_TIMER_DELAY_MS,
  );
  const shutdownTimeoutMs = positiveInteger(
    env,
    'SHUTDOWN_TIMEOUT_MS',
    DEFAULT_SHUTDOWN_TIMEOUT_MS,
    operationTimeoutMs,
    MAX_TIMER_DELAY_MS,
  );

  const relayIntervalMs = positiveInteger(
    env,
    'OUTBOX_RELAY_INTERVAL_MS',
    DEFAULT_RELAY_INTERVAL_MS,
    100,
    MAX_TIMER_DELAY_MS,
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

  const eventDeliveryLimit = positiveInteger(
    env,
    'EVENT_DELIVERY_LIMIT',
    DEFAULT_EVENT_DELIVERY_LIMIT,
    2,
    20,
  );
  const eventRedeliveryDelayMs = positiveInteger(
    env,
    'EVENT_REDELIVERY_DELAY_MS',
    DEFAULT_EVENT_REDELIVERY_DELAY_MS,
    100,
    30_000,
  );
  const outboxRetentionMs = positiveInteger(
    env,
    'OUTBOX_RETENTION_MS',
    DEFAULT_OUTBOX_RETENTION_MS,
    1,
  );
  const inboxRetentionMs = positiveInteger(
    env,
    'INBOX_RETENTION_MS',
    DEFAULT_INBOX_RETENTION_MS,
    outboxRetentionMs,
  );
  const retentionIntervalMs = positiveInteger(
    env,
    'DELIVERY_RETENTION_INTERVAL_MS',
    DEFAULT_RETENTION_INTERVAL_MS,
    100,
    MAX_TIMER_DELAY_MS,
  );
  if (retentionIntervalMs >= outboxRetentionMs || retentionIntervalMs >= inboxRetentionMs) {
    throw new Error('DELIVERY_RETENTION_INTERVAL_MS must be shorter than both retention periods.');
  }
  const retentionBatchSize = positiveInteger(
    env,
    'DELIVERY_RETENTION_BATCH_SIZE',
    DEFAULT_RETENTION_BATCH_SIZE,
    1,
    10_000,
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
    eventDeliveryLimit,
    eventRedeliveryDelayMs,
    outboxRetentionMs,
    inboxRetentionMs,
    retentionIntervalMs,
    retentionBatchSize,
  };
}
