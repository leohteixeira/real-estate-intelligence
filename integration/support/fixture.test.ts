import getPort from 'get-port';
import { Wait } from 'testcontainers';
import type { OneShotStartupCheckStrategy } from 'testcontainers/build/wait-strategies/one-shot-startup-startegy.js';
import { expect, test, vi } from 'vitest';
import type { Command, ComposeBuilder } from './fixture.ts';
import {
  allocatePorts,
  availablePort,
  cleanupAll,
  ComposeFixture,
  preserveCleanup,
} from './fixture.ts';

vi.mock('get-port', () => ({ default: vi.fn() }));

test('allocated fixture ports probe the wildcard address used by Compose', async () => {
  const getPortMock = vi.mocked(getPort).mockReset();
  getPortMock.mockResolvedValueOnce(48011).mockResolvedValueOnce(48012);
  await expect(allocatePorts(2)).resolves.toEqual([48011, 48012]);
  expect(getPortMock.mock.calls).toEqual([[{ host: '0.0.0.0' }], [{ host: '0.0.0.0' }]]);
});

test('an automatically available fixture port probes the Compose wildcard address', async () => {
  const getPortMock = vi.mocked(getPort).mockReset().mockResolvedValueOnce(48013);
  await expect(availablePort()).resolves.toBe(48013);
  expect(getPortMock).toHaveBeenCalledExactlyOnceWith({ host: '0.0.0.0', port: undefined });
});

test('an explicitly requested fixture port probes the Compose wildcard address', async () => {
  const getPortMock = vi.mocked(getPort).mockReset().mockResolvedValueOnce(48014);
  await expect(availablePort(48014)).resolves.toBe(48014);
  expect(getPortMock).toHaveBeenCalledExactlyOnceWith({ host: '0.0.0.0', port: 48014 });
});

test('an unavailable requested fixture port fails instead of selecting a replacement', async () => {
  const getPortMock = vi.mocked(getPort).mockReset().mockResolvedValueOnce(48015);
  await expect(availablePort(40585)).rejects.toThrow('Requested fixture port is unavailable.');
  expect(getPortMock).toHaveBeenCalledExactlyOnceWith({ host: '0.0.0.0', port: 40585 });
});

function fixture({
  startupFailure,
  cleanupFailure,
}: { startupFailure?: unknown; cleanupFailure?: unknown } = {}) {
  const down = vi.fn(async () => {
    if (cleanupFailure) throw cleanupFailure;
  });
  const builder = {
    withEnvironment: vi.fn(
      (_environment: Parameters<ComposeBuilder['withEnvironment']>[0]): ComposeBuilder => {
        void _environment;
        return builder;
      },
    ),
    withProjectName: vi.fn((_project: string): ComposeBuilder => {
      void _project;
      return builder;
    }),
    withStartupTimeout: vi.fn((_timeout: number): ComposeBuilder => {
      void _timeout;
      return builder;
    }),
    withClientOptions: vi.fn(
      (_options: Parameters<ComposeBuilder['withClientOptions']>[0]): ComposeBuilder => {
        void _options;
        return builder;
      },
    ),
    withWaitStrategy: vi.fn(
      (
        _service: string,
        _strategy: Parameters<ComposeBuilder['withWaitStrategy']>[1],
      ): ComposeBuilder => {
        void _service;
        void _strategy;
        return builder;
      },
    ),
    withProfiles: vi.fn((..._profiles: string[]): ComposeBuilder => {
      void _profiles;
      return builder;
    }),
    withBuild: vi.fn((): ComposeBuilder => builder),
    up: vi.fn(async (_services: string[]) => {
      void _services;
      if (startupFailure) throw startupFailure;
      return { down };
    }),
  };
  const execute = vi.fn<Command>(async (_file, _args, _options) => {
    void _file;
    void _args;
    void _options;
    if (cleanupFailure) throw cleanupFailure;
    return { stdout: '', stderr: '' };
  });
  const owned = new ComposeFixture(
    'rei-support-fixture',
    { COMPOSE_PROFILES: 'tools', API_PORT: '48001' },
    { create: () => builder, execute },
  );
  return { owned, builder, down, execute };
}

test('starts only selected services, preserves profiles and performs exact owned teardown', async () => {
  const { owned, builder, down, execute } = fixture();
  await owned.up(['--detach', '--build', '--wait', 'postgres']);
  expect(builder.up).toHaveBeenCalledWith(['postgres']);
  expect(builder.withProfiles).toHaveBeenCalledWith('tools');
  expect(builder.withBuild).toHaveBeenCalledOnce();
  expect(builder.withEnvironment).toHaveBeenCalledWith(
    expect.objectContaining({ COMPOSE_DISABLE_ENV_FILE: '1', COMPOSE_ENV_FILES: '' }),
  );
  await owned.down();
  expect(down).toHaveBeenCalledWith({ timeout: 120_000, removeVolumes: true });
  expect(
    execute.mock.calls.every(([, args]) =>
      args!.includes('label=com.docker.compose.project=rei-support-fixture'),
    ),
  ).toBe(true);
  await owned.down();
  expect(down).toHaveBeenCalledOnce();
});

test('rejects default-stack and foreign project identifiers', () => {
  for (const project of ['real-estate-intelligence', '', '../rei-fixture', 'REI-fixture'])
    expect(() => new ComposeFixture(project, {})).toThrow(/owned rei-/);
});

test('later staged startup preserves changed worker environment and disabled env-file loading', async () => {
  const { owned, builder } = fixture();
  await owned.up(['postgres']);
  await owned.up(['worker'], {
    SYNTHETIC_PAGE_DELAY_MS: '5000',
    COMPOSE_DISABLE_ENV_FILE: '0',
    COMPOSE_ENV_FILES: 'must-not-load',
  });
  expect(builder.withEnvironment).toHaveBeenLastCalledWith(
    expect.objectContaining({
      SYNTHETIC_PAGE_DELAY_MS: '5000',
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
    }),
  );
  await owned.down();
});

test('one-shot waits resolve exact project/service labels including exited containers', async () => {
  const strategy = Wait.forOneShotStartup() as OneShotStartupCheckStrategy;
  const completed = {
    Running: false,
    Paused: false,
    StartedAt: '2026-10-11T06:00:00Z',
    FinishedAt: '2026-10-11T06:00:01Z',
    ExitCode: 0,
  };
  for (const [state, expected] of [
    [completed, 'SUCCESS'],
    [{ ...completed, ExitCode: 1 }, 'FAIL'],
    [{ ...completed, Running: true }, 'PENDING'],
    [{ ...completed, Paused: true }, 'PENDING'],
    [{ ...completed, StartedAt: '0001-01-01T00:00:00Z' }, 'PENDING'],
  ] as const) {
    const docker = { getContainer: () => ({ inspect: async () => ({ State: state }) }) };
    const startupStatus: unknown = await Reflect.apply(strategy.checkStartupState, strategy, [
      docker,
      'owned-migration',
    ]);
    expect(startupStatus).toBe(expected);
  }
  const container = { id: 'owned-migration' };
  const listContainers = vi.fn(async () => [{ Id: container.id }]);
  const getById = vi.fn(() => container);
  const wait = {
    withStartupTimeout: vi.fn((_timeout: number): typeof wait => {
      void _timeout;
      return wait;
    }),
    waitUntilReady: vi.fn(async () => {}),
  };
  const owned = new ComposeFixture(
    'rei-support-wait',
    {},
    {
      runtime: async () => ({ container: { dockerode: { listContainers }, getById } }),
      oneShotWait: () => wait,
    },
  );
  await expect(owned.wait(['migrations'], 180_000)).resolves.toMatchObject({ exitCode: 0 });
  expect(listContainers).toHaveBeenCalledWith({
    all: true,
    filters: {
      label: [
        'com.docker.compose.project=rei-support-wait',
        'com.docker.compose.service=migrations',
      ],
    },
  });
  expect(getById).toHaveBeenCalledWith(container.id);
  expect(wait.withStartupTimeout).toHaveBeenCalledWith(180_000);
  expect(wait.waitUntilReady).toHaveBeenCalledWith(container);
  const primary = new Error('one-shot exited nonzero or exceeded its deadline');
  wait.waitUntilReady.mockRejectedValueOnce(primary);
  await expect(owned.wait(['migrations'])).rejects.toBe(primary);
  listContainers.mockResolvedValueOnce([]);
  await expect(owned.wait(['migrations'])).rejects.toThrow(/No owned migrations/);
  await expect(owned.wait([])).rejects.toThrow(/explicit owned service/);
});

test('readiness failure still tears down exact owned resources and propagates the primary cause', async () => {
  const primary = new Error('readiness fault');
  const { owned, execute } = fixture({ startupFailure: primary });
  await expect(owned.up(['postgres'])).rejects.toBe(primary);
  expect(execute!.mock.calls[0]![1]).toEqual([
    'compose',
    '--file',
    'compose.yaml',
    '--project-name',
    'rei-support-fixture',
    'down',
    '--volumes',
    '--remove-orphans',
  ]);
  expect(owned.dirty).toBe(false);
});

test('startup and cleanup failures remain independently visible', async () => {
  const primary = new Error('startup fault');
  const cleanup = new Error('cleanup fault');
  const { owned } = fixture({ startupFailure: primary, cleanupFailure: cleanup });
  await expect(owned.up(['postgres'])).rejects.toMatchObject({ errors: [primary, cleanup] });
  expect(owned.dirty).toBe(true);
});

test('reports resource leakage rather than successful cleanup', async () => {
  const { owned } = fixture();
  await owned.up(['postgres']);
  owned.execute = vi.fn(async () => ({ stdout: 'owned-container-id' }));
  await expect(owned.down()).rejects.toThrow(/resources remain/);
  expect(owned.dirty).toBe(true);
});

test('preserves assertion failure and teardown failure together', async () => {
  const primary = new Error('assertion fault');
  const cleanup = new Error('teardown fault');
  await expect(
    preserveCleanup(
      async () => {
        throw primary;
      },
      async () => {
        throw cleanup;
      },
    ),
  ).rejects.toMatchObject({ errors: [primary, cleanup] });
});

test('retains falsy throws and every nested resource failure while releasing later resources', async () => {
  const releases: string[] = [];
  const nested = preserveCleanup(
    async () => {
      throw undefined;
    },
    () =>
      cleanupAll(
        async () => {
          releases.push('database');
          throw false;
        },
        async () => {
          releases.push('adapter');
          throw 0;
        },
        async () => {
          releases.push('server');
        },
      ),
  );
  await expect(nested).rejects.toMatchObject({
    errors: [undefined, expect.objectContaining({ errors: [false, 0] })],
  });
  expect(releases).toEqual(['database', 'adapter', 'server']);
  await expect(
    preserveCleanup(
      async () => {
        throw '';
      },
      async () => {},
    ),
  ).rejects.toBe('');
});
