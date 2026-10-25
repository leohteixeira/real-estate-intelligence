import { execa } from 'execa';
import { expect, test } from 'vitest';

const settings = {
  REI_IMAGE_REPOSITORY: 'registry.example.invalid/rei',
  REI_MIGRATE_DIGEST: '1'.repeat(64),
  REI_API_DIGEST: '2'.repeat(64),
  REI_WORKER_DIGEST: '3'.repeat(64),
  REI_AI_DIGEST: '4'.repeat(64),
  REI_WEB_DIGEST: '5'.repeat(64),
  AI_GATEWAY_API_KEY: 'controlled_gateway_fixture',
  DATABASE_URL: 'postgres://portfolio-postgres18/rei',
  RABBITMQ_URL: 'amqp://fixture:controlled@portfolio-rabbitmq/rei',
  ASK_DISPATCH_SECRET: 'd'.repeat(64),
  AI_INTERNAL_TOKEN: 'a'.repeat(64),
  OBJECT_STORE_ENDPOINT: 'https://objects.example.invalid',
  OBJECT_STORE_REGION: 'fixture',
  OBJECT_STORE_BUCKET: 'rei',
  OBJECT_STORE_ACCESS_KEY_ID: 'fixture',
  OBJECT_STORE_SECRET_ACCESS_KEY: 'controlled',
  SNAPSHOT_ENCRYPTION_KEY_ID: 'fixture',
  SNAPSHOT_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
};
const config = (overrides: Record<string, string | undefined> = {}) =>
  execa('docker', ['compose', '--file', 'compose.production.yaml', 'config', '--format', 'json'], {
    extendEnv: false,
    env: {
      PATH: process.env.PATH,
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      ...settings,
      ...overrides,
    },
    timeout: 30_000,
  });
interface Service {
  image: string;
  ports?: unknown[];
  build?: unknown;
  cpus: number;
  mem_limit: string | number;
  pids_limit: number;
  environment?: Record<string, string>;
  networks: Record<string, unknown>;
}

test('production isolates five immutable application images with bounded resources and external dependencies', async () => {
  const { stdout } = await config();
  const parsed = JSON.parse(stdout) as {
    services: Record<'migrations' | 'api' | 'worker' | 'ai' | 'web', Service>;
    networks: Record<string, { name: string; external?: boolean }>;
  };
  expect(Object.keys(parsed.services).sort()).toEqual(['ai', 'api', 'migrations', 'web', 'worker']);
  for (const service of Object.values(parsed.services)) {
    expect(service.image).toMatch(/@sha256:[a-f0-9]{64}$/);
    expect(service.build).toBeUndefined();
    expect(service.ports ?? []).toEqual([]);
    expect(service.cpus).toBeGreaterThan(0);
    expect(Number(service.mem_limit)).toBeGreaterThan(0);
    expect(service.pids_limit).toBeGreaterThan(0);
  }
  for (const [key, name] of [
    ['edge', 'portfolio-edge'],
    ['data', 'portfolio-data'],
    ['telemetry', 'portfolio-telemetry'],
  ]) {
    expect(parsed.networks[key!]).toMatchObject({ name, external: true });
  }
  expect(Object.keys(parsed.services.ai.networks).sort()).toEqual(['app', 'telemetry']);
  expect(Object.keys(parsed.services.web.networks).sort()).toEqual(['app', 'edge']);
  for (const name of ['ai', 'web'] as const) {
    expect(Object.keys(parsed.services[name].environment ?? {})).not.toEqual(
      expect.arrayContaining(['DATABASE_URL']),
    );
    expect(JSON.stringify(parsed.services[name].environment ?? {})).not.toMatch(
      /RABBITMQ|OBJECT_STORE|SNAPSHOT_ENCRYPTION/,
    );
  }
  expect(parsed.services.ai.environment?.AI_GATEWAY_API_KEY).toBe(settings.AI_GATEWAY_API_KEY);
  for (const name of ['api', 'worker', 'web', 'migrations'] as const) {
    expect(parsed.services[name].environment ?? {}).not.toHaveProperty('AI_GATEWAY_API_KEY');
  }
  expect(parsed.services.api.environment?.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(
    'http://portfolio-collector:4318',
  );
});

test.each(Object.keys(settings))(
  'production rejects missing required input %s before startup',
  async (name) => {
    await expect(config({ [name]: undefined })).rejects.toThrow();
  },
);
