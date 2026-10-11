import { execa } from 'execa';
import { randomUUID } from 'node:crypto';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';
import { expect, test } from 'vitest';
import { cleanupAll, preserveCleanup } from './support/fixture.ts';

test('RabbitMQ survives four simultaneous fresh-volume boots with the product non-root healthcheck', async () => {
  const project = `rei-rabbit-healthcheck-${process.pid}-${randomUUID().slice(0, 8)}`;
  const environment = { ...process.env, COMPOSE_DISABLE_ENV_FILE: '1', COMPOSE_ENV_FILES: '' };
  const docker = (...args: string[]) =>
    execa('docker', args, { env: environment, timeout: 120_000 });
  const resources: { name: string; volume: string; started: StartedTestContainer | undefined }[] =
    Array.from({ length: 4 }, (_, index) => ({
      name: `${project}-${index}`,
      volume: `${project}-data-${index}`,
      started: undefined,
    }));
  await preserveCleanup(
    async () => {
      const { stdout } = await docker(
        'compose',
        '--file',
        'compose.yaml',
        '--project-name',
        project,
        'config',
        '--format',
        'json',
      );
      const config = (
        JSON.parse(stdout) as {
          services: { rabbitmq: { image: string; healthcheck: { test: ['CMD', ...string[]] } } };
        }
      ).services.rabbitmq;
      expect(config.healthcheck.test).toStrictEqual([
        'CMD',
        'su-exec',
        'rabbitmq',
        'rabbitmq-diagnostics',
        '-q',
        'ping',
      ]);
      expect(new Set(resources.map((resource) => resource.volume)).size).toBe(4);
      const results = await Promise.allSettled(
        resources.map(async (resource) => {
          await docker(
            'volume',
            'create',
            '--label',
            `com.docker.compose.project=${project}`,
            resource.volume,
          );
          resource.started = await new GenericContainer(config.image)
            .withName(resource.name)
            .withLabels({ 'com.docker.compose.project': project })
            .withBindMounts([{ source: resource.volume, target: '/var/lib/rabbitmq', mode: 'rw' }])
            .withHealthCheck({
              test: config.healthcheck.test,
              interval: 1_000,
              timeout: 5_000,
              retries: 60,
            })
            .withWaitStrategy(Wait.forHealthCheck())
            .withStartupTimeout(90_000)
            .start();
          const state = JSON.parse(
            (await docker('inspect', '--format', '{{json .State}}', resource!.started.getId()))
              .stdout,
          ) as { Running: boolean; Health: { Status: string } };
          expect(state.Running, `${resource.name} exited during startup`).toBe(true);
          expect(state.Health.Status, `${resource.name} never became healthy`).toBe('healthy');
          const metadata = await resource!.started.exec([
            'stat',
            '-c',
            '%u %a',
            '/var/lib/rabbitmq/.erlang.cookie',
          ]);
          expect(metadata.exitCode).toBe(0);
          expect(metadata.stdout.trim()).toBe('100 400');
        }),
      );
      const failures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);
      if (failures.length)
        throw new AggregateError(failures, 'Parallel fresh-volume broker probes failed');
      console.log(
        'RabbitMQ healthcheck passed: four parallel fresh-volume boots with one-second non-root probes, private cookie metadata and distinct storage.',
      );
    },
    async () => {
      const results = await Promise.allSettled(
        resources.map(async (resource) => {
          await cleanupAll(
            async () => {
              if (resource.started) {
                expect(resource.started!.getLabels()['com.docker.compose.project']).toBe(project);
                await resource.started!.stop({
                  timeout: 10_000,
                  remove: true,
                  removeVolumes: true,
                });
              } else {
                // A failed readiness wait can leave a created container before start returns.
                const owned = await docker(
                  'inspect',
                  '--format',
                  '{{index .Config.Labels "com.docker.compose.project"}}',
                  resource.name,
                ).catch((error) => {
                  if (/No such (object|container)/i.test(error.stderr)) return null;
                  throw error;
                });
                if (owned) {
                  expect(owned.stdout.trim()).toBe(project);
                  await docker('rm', '--force', resource.name);
                }
              }
            },
            async () => {
              const volume = await docker(
                'volume',
                'inspect',
                '--format',
                '{{index .Labels "com.docker.compose.project"}}',
                resource.volume,
              ).catch((error) => {
                if (/no such volume/i.test(error.stderr)) return null;
                throw error;
              });
              if (volume) {
                expect(volume.stdout.trim()).toBe(project);
                await docker('volume', 'rm', resource.volume);
              }
            },
          );
        }),
      );
      const failures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);
      await cleanupAll(
        async () => {
          if (failures.length) throw new AggregateError(failures, 'Broker fixture cleanup failed');
        },
        async () => {
          const remaining = await docker(
            'ps',
            '--all',
            '--filter',
            `label=com.docker.compose.project=${project}`,
            '--format',
            '{{.ID}}',
          );
          expect(remaining.stdout.trim()).toBe('');
        },
      );
    },
  );
});
