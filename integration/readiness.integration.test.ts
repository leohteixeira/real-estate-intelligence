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
    // Credential-free evidence for a recovery that never arrives: whether the API container
    // resolves and reaches each dependency, and what the broker itself reports.
    const recovered = async (database: boolean, broker: boolean) => {
      try {
        await vi.waitFor(() => check(database, broker), { timeout: 30_000, interval: 200 });
      } catch (error) {
        const probe = await compose(
          'exec',
          '-T',
          'api',
          'node',
          '-e',
          `const dns=require('node:dns').promises,net=require('node:net');(async()=>{const out={};for(const host of ['rabbitmq','postgres']){const started=Date.now();try{out[host]={resolved:(await dns.lookup(host)).address!==undefined}}catch(error){out[host]={code:error.code}}out[host].lookupMs=Date.now()-started}const started=Date.now();out.amqpSocket=await new Promise((resolve)=>{const socket=net.connect({host:'rabbitmq',port:5672,timeout:3000});socket.on('connect',()=>{socket.destroy();resolve('connected')});socket.on('timeout',()=>{socket.destroy();resolve('timeout')});socket.on('error',(error)=>resolve(error.code))});out.amqpSocketMs=Date.now()-started;console.log(JSON.stringify(out))})()`,
        ).then(
          (result) => result.stdout.trim(),
          (failure: unknown) => `probe failed: ${String(failure).slice(0, 200)}`,
        );
        const listeners = await compose(
          'exec',
          '-T',
          'rabbitmq',
          'rabbitmq-diagnostics',
          '-q',
          'check_port_connectivity',
        ).then(
          () => 'listeners accept connections',
          () => 'listeners refuse connections',
        );
        const hostHandshake = await new RabbitMqAvailabilityProbe(
          `amqp://${user}:${password}@127.0.0.1:${rabbit}/${user}`,
        ).isAvailable(AbortSignal.timeout(2_000));
        console.error(
          `${phase}: API container view ${probe}; broker ${listeners}; authenticated host handshake ${String(hostHandshake)}`,
        );
        throw error;
      }
    };
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
    await recovered(true, true);
    phase = 'broker paused';
    await compose('pause', 'rabbitmq');
    try {
      await check(true, false);
    } finally {
      phase = 'broker recovering';
      await compose('unpause', 'rabbitmq');
    }
    await recovered(true, true);
    phase = 'broker stopped';
    await compose('stop', 'rabbitmq');
    await check(true, false);
    phase = 'both stopped';
    await compose('stop', 'postgres');
    await check(false, false);
    phase = 'broker restarted with database stopped';
    await compose('start', 'rabbitmq');
    await waitHealthy('rabbitmq');
    await recovered(false, true);
    phase = 'both restarted';
    await compose('start', 'postgres');
    await waitHealthy('postgres');
    await recovered(true, true);
    expect((await compose('ps', '-q', 'api')).stdout.trim()).toBe(apiId);
    expect(await topology()).toBe(queuesBefore);
  });
});
