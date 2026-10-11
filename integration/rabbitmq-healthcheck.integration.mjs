import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const project = `rei-rabbit-healthcheck-${process.pid}-${randomUUID().slice(0, 8)}`;
const environment = { ...process.env, COMPOSE_DISABLE_ENV_FILE: '1', COMPOSE_ENV_FILES: '' };
const docker = (...args) =>
  execute('docker', args, { env: environment, timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
const resources = Array.from({ length: 4 }, (_, index) => ({
  container: `${project}-${index}`,
  volume: `${project}-data-${index}`,
}));
try {
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
  const config = JSON.parse(stdout).services.rabbitmq;
  assert.deepEqual(config.healthcheck.test, [
    'CMD',
    'su-exec',
    'rabbitmq',
    'rabbitmq-diagnostics',
    '-q',
    'ping',
  ]);
  const results = await Promise.allSettled(
    resources.map(async (resource) => {
      await docker(
        'volume',
        'create',
        '--label',
        `com.docker.compose.project=${project}`,
        resource.volume,
      );
      await docker(
        'run',
        '--detach',
        '--name',
        resource.container,
        '--label',
        `com.docker.compose.project=${project}`,
        '--mount',
        `type=volume,source=${resource.volume},target=/var/lib/rabbitmq`,
        '--health-cmd',
        config.healthcheck.test.slice(1).join(' '),
        '--health-interval',
        '1s',
        '--health-timeout',
        '5s',
        '--health-retries',
        '60',
        config.image,
      );
      const deadline = Date.now() + 90000;
      let healthy = false;
      while (Date.now() < deadline) {
        const state = JSON.parse(
          (await docker('inspect', '--format', '{{json .State}}', resource.container)).stdout,
        );
        assert.equal(state.Running, true, `${resource.container} exited during startup`);
        if (state.Health?.Status === 'healthy') {
          healthy = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      assert(healthy, `${resource.container} never became healthy`);
      // Metadata only: never read or print cookie contents.
      const metadata = (
        await docker(
          'exec',
          resource.container,
          'stat',
          '-c',
          '%u %a',
          '/var/lib/rabbitmq/.erlang.cookie',
        )
      ).stdout.trim();
      assert.equal(metadata, '100 400');
    }),
  );
  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length)
    throw new AggregateError(
      failures.map((result) => result.reason),
      'Parallel fresh-volume broker probes failed',
    );
  console.log(
    'RabbitMQ healthcheck passed: four parallel fresh-volume boots with one-second non-root probes, owned private cookie metadata, no shared volume.',
  );
} finally {
  for (const resource of resources) {
    const exists = await docker(
      'container',
      'inspect',
      '--format',
      '{{index .Config.Labels "com.docker.compose.project"}}',
      resource.container,
    ).catch(() => null);
    if (exists) {
      assert.equal(exists.stdout.trim(), project);
      await docker('rm', '--force', resource.container);
    }
    const volume = await docker(
      'volume',
      'inspect',
      '--format',
      '{{index .Labels "com.docker.compose.project"}}',
      resource.volume,
    ).catch(() => null);
    if (volume) {
      assert.equal(volume.stdout.trim(), project);
      await docker('volume', 'rm', resource.volume);
    }
  }
  const remaining = await docker(
    'ps',
    '--all',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.ID}}',
  );
  assert.equal(remaining.stdout.trim(), '');
  console.log(`Cleaned exact broker-probe fixture ${project}.`);
}
