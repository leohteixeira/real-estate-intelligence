import { randomUUID } from 'node:crypto';
import { BoundPorts, getContainerRuntimeClient, Wait } from 'testcontainers';
import { expect, test, vi } from 'vitest';
import { RabbitMqAvailabilityProbe } from '../packages/infrastructure/dist/index.js';
import { allocatePorts, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

test('readiness reports independent database/broker outages and recovers through the public web proxy', async () => {
  await withCampaign(async ({ command }) => {
    const project = `rei-readiness-${randomUUID()}`;
    const [postgres, rabbit, management, api, web] = await allocatePorts(5);
    const user = 'rei_readiness';
    const password = 'controlled_readiness_fixture';
    const env = {
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      NODE_ENV: 'test',
      COMPOSE_PARALLEL_LIMIT: '1',
      POSTGRES_USER: user,
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: user,
      POSTGRES_PORT: String(postgres),
      RABBITMQ_PORT: String(rabbit),
      RABBITMQ_MANAGEMENT_PORT: String(management),
      RABBITMQ_USER: user,
      RABBITMQ_PASSWORD: password,
      RABBITMQ_VHOST: user,
      API_PORT: String(api),
      WEB_PORT: String(web),
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const compose = (...args: string[]) =>
      command('docker', ['compose', '--file', 'compose.yaml', '--project-name', project, ...args], {
        env,
        timeout: 240_000,
      });
    // Image preparation is a separate prerequisite, outside the HTTP scenario deadline.
    for (const service of ['migrations', 'api', 'web']) {
      await command('docker', [
        'image',
        'tag',
        `rei-readiness-images-${service}`,
        `${project}-${service}`,
      ]);
    }
    await compose('up', '--detach', 'postgres', 'migrations', 'rabbitmq', 'api', 'web');
    const apiBase = `http://127.0.0.1:${api}`;
    const webBase = `http://127.0.0.1:${web}`;
    const apiId = (await compose('ps', '-q', 'api')).stdout.trim();
    const waitHealthy = async (service: string) => {
      const id = (await compose('ps', '-q', service)).stdout.trim();
      expect(id, `Owned ${service} container exists`).not.toBe('');
      const runtime = await getContainerRuntimeClient();
      // Reuse the fixture's native health strategy and existing startup deadline. Starting a
      // container does not establish that RabbitMQ has finished booting and accepts credentials.
      await Wait.forHealthCheck()
        .withStartupTimeout(240_000)
        .waitUntilReady(runtime.container.getById(id), new BoundPorts());
    };
    let phase = 'healthy';
    const check = async (database: boolean, broker: boolean) => {
      for (const base of [apiBase, webBase]) {
        const started = Date.now();
        const response = await requestHttp(`${base}/ready`);
        expect(Date.now() - started).toBeLessThan(3_000);
        expect(response.status).toBe(database && broker ? 200 : 503);
        expect(await response.json(), `${phase}: ${base}`).toStrictEqual({
          status: database && broker ? 'ready' : 'not-ready',
          database: database ? 'available' : 'unavailable',
          broker: broker ? 'available' : 'unavailable',
        });
        expect(await response.text()).not.toContain(password);
        expect(await response.text()).not.toContain(user);
      }
      const liveness = await requestHttp(`${apiBase}/health`);
      expect(liveness.status).toBe(200);
      expect(await liveness.json()).toStrictEqual({ status: 'healthy' });
    };
    const topology = async () =>
      (
        await compose(
          'exec',
          '-T',
          'rabbitmq',
          'rabbitmqctl',
          '-q',
          'list_queues',
          '-p',
          user,
          'name',
        )
      ).stdout.trim();
    const queuesBefore = await topology();
    await check(true, true);
    for (const url of [
      `amqp://${user}:wrong_password@127.0.0.1:${rabbit}/${user}`,
      `amqp://${user}:${password}@127.0.0.1:${rabbit}/missing_vhost`,
    ]) {
      await expect(
        new RabbitMqAvailabilityProbe(url).isAvailable(AbortSignal.timeout(2_000)),
      ).resolves.toBe(false);
    }
    expect(await topology()).toBe(queuesBefore);
    const landing = await requestHttp(`${webBase}/`);
    expect(landing.status).toBe(308);
    expect(landing.headers.get('location')).toBe(
      'https://leohteixeira.com/en/projects/real-estate-intelligence',
    );

    // Pausing retains established sockets and exercises the caller deadline, beyond refusal.
    phase = 'database paused';
    await compose('pause', 'postgres');
    try {
      await check(false, true);
    } finally {
      phase = 'database recovering';
      await compose('unpause', 'postgres');
    }
    await vi.waitFor(() => check(true, true), { timeout: 30_000, interval: 200 });
    phase = 'broker paused';
    await compose('pause', 'rabbitmq');
    try {
      await check(true, false);
    } finally {
      phase = 'broker recovering';
      await compose('unpause', 'rabbitmq');
    }
    await vi.waitFor(() => check(true, true), { timeout: 30_000, interval: 200 });
    phase = 'broker stopped';
    await compose('stop', 'rabbitmq');
    await check(true, false);
    phase = 'both stopped';
    await compose('stop', 'postgres');
    await check(false, false);
    phase = 'broker restarted with database stopped';
    await compose('start', 'rabbitmq');
    await waitHealthy('rabbitmq');
    await vi.waitFor(() => check(false, true), { timeout: 30_000, interval: 200 });
    phase = 'both restarted';
    await compose('start', 'postgres');
    await waitHealthy('postgres');
    await vi.waitFor(() => check(true, true), { timeout: 30_000, interval: 200 });
    expect((await compose('ps', '-q', 'api')).stdout.trim()).toBe(apiId);
    expect(await topology()).toBe(queuesBefore);
  });
});
