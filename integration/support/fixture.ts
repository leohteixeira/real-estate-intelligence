import type { Options } from 'execa';
import { execa } from 'execa';
import getPort from 'get-port';
import { fileURLToPath } from 'node:url';
import type { WaitStrategy } from 'testcontainers';
import {
  BoundPorts,
  DockerComposeEnvironment,
  getContainerRuntimeClient,
  Wait,
} from 'testcontainers';
import { preserveCleanup } from './cleanup.ts';
import { allowOwnedEndpoint } from './network.ts';
export { cleanupAll, preserveCleanup } from './cleanup.ts';

const root = fileURLToPath(new URL('../..', import.meta.url));
export type Environment = Record<string, string | undefined>;
export type CommandOptions = Pick<
  Options,
  'cwd' | 'env' | 'timeout' | 'maxBuffer' | 'input' | 'reject'
>;
export interface CommandResult {
  stdout: string;
  stderr?: string;
  exitCode?: number;
}
export type Command = (
  file: string,
  args: string[],
  options?: CommandOptions,
) => Promise<CommandResult>;
interface StartedFixture {
  down(options: { timeout: number; removeVolumes: boolean }): Promise<unknown>;
}
export interface ComposeBuilder {
  withEnvironment(environment: Environment): ComposeBuilder;
  withProjectName(project: string): ComposeBuilder;
  withStartupTimeout(timeout: number): ComposeBuilder;
  withClientOptions(options: { commandOptions: string[] }): ComposeBuilder;
  withWaitStrategy(service: string, strategy: WaitStrategy): ComposeBuilder;
  withProfiles(...profiles: string[]): ComposeBuilder;
  withBuild(): ComposeBuilder;
  up(services: string[]): Promise<StartedFixture>;
}
type RuntimeClient = Awaited<ReturnType<typeof getContainerRuntimeClient>>;
type OwnedContainer = ReturnType<RuntimeClient['container']['getById']>;
export interface FixtureRuntime<TContainer = OwnedContainer> {
  container: {
    dockerode: {
      listContainers(options: {
        all: boolean;
        filters: { label: string[] };
      }): Promise<Array<{ Id: string }>>;
    };
    getById(id: string): TContainer;
  };
}
interface OneShotWait<TContainer> {
  withStartupTimeout(timeout: number): OneShotWait<TContainer>;
  waitUntilReady(container: TContainer): Promise<unknown>;
}
interface FixtureDependencies<TContainer> {
  create?: (root: string, file: string | string[]) => ComposeBuilder;
  preparedSearch?: boolean;
  execute?: Command;
  runtime?: () => Promise<FixtureRuntime<TContainer>>;
  oneShotWait?: () => OneShotWait<TContainer>;
}
function ownedWait<TContainer>(
  runtime: () => Promise<FixtureRuntime<TContainer>>,
  oneShotWait: () => OneShotWait<TContainer>,
) {
  return async (project: string, services: string[], timeout: number) => {
    const client = await runtime();
    for (const service of services) {
      const containers = await client.container.dockerode.listContainers({
        all: true,
        filters: {
          label: [`com.docker.compose.project=${project}`, `com.docker.compose.service=${service}`],
        },
      });
      if (!containers.length) throw new Error(`No owned ${service} container exists for the wait.`);
      await Promise.all(
        containers.map((container) =>
          oneShotWait()
            .withStartupTimeout(timeout)
            .waitUntilReady(client.container.getById(container.Id)),
        ),
      );
    }
  };
}
const nativeWait = ownedWait(getContainerRuntimeClient, () => {
  const strategy = Wait.forOneShotStartup();
  const adapter: OneShotWait<OwnedContainer> = {
    withStartupTimeout(timeout) {
      strategy.withStartupTimeout(timeout);
      return adapter;
    },
    waitUntilReady(container) {
      return strategy.waitUntilReady(container, new BoundPorts());
    },
  };
  return adapter;
});
const portNames = [
  'POSTGRES_PORT',
  'API_PORT',
  'RABBITMQ_PORT',
  'RABBITMQ_MANAGEMENT_PORT',
  'MINIO_API_PORT',
  'MINIO_CONSOLE_PORT',
  'AI_PORT',
  'WEB_PORT',
  'VALKEY_PORT',
];

export async function allocatePorts(count: number) {
  const ports = [];
  for (let i = 0; i < count; i++) {
    const port = await getPort({ host: '0.0.0.0' });
    ports.push(port);
    allowOwnedEndpoint(`http://127.0.0.1:${port}`);
    allowOwnedEndpoint(`http://localhost:${port}`);
  }
  return ports;
}

export async function availablePort(requested?: number) {
  const port = await getPort({ host: '0.0.0.0', port: requested });
  if (requested && requested !== port) throw new Error('Requested fixture port is unavailable.');
  allowOwnedEndpoint(`http://127.0.0.1:${port}`);
  return port;
}

/**
 * Forced on every owned Compose command. No env file is loaded, and the provider key is always
 * empty: Compose inherits the host shell, where `ANTHROPIC_API_KEY` is commonly exported, and a
 * fixture AI container must never be able to send a test question to the real Anthropic API.
 */
const isolatedEnvironment = Object.freeze({
  COMPOSE_DISABLE_ENV_FILE: '1',
  COMPOSE_ENV_FILES: '',
  ANTHROPIC_API_KEY: '',
});
export class ComposeFixture<TContainer = OwnedContainer> {
  project: string;
  environment: Environment;
  create: NonNullable<FixtureDependencies<TContainer>['create']>;
  execute: Command;
  waitOwned: typeof nativeWait;
  started: StartedFixture | undefined;
  dirty: boolean;
  readonly preparedSearch: boolean;
  constructor(
    project: string,
    environment: Environment,
    {
      create = (root, file) => new DockerComposeEnvironment(root, file),
      execute = (file, args, options) => execa(file, args, options),
      runtime,
      oneShotWait,
      preparedSearch = false,
    }: FixtureDependencies<TContainer> = {},
  ) {
    if (!/^rei-[a-z0-9_-]+$/.test(project))
      throw new Error('An integration fixture needs an owned rei- project name.');
    this.preparedSearch = preparedSearch;
    this.project = project;
    this.environment = {
      ...environment,
      ...isolatedEnvironment,
      ...(preparedSearch ? { PREPARED_SEARCH_SOURCE_ROOT: root } : {}),
    };
    this.create = create;
    this.execute = execute;
    this.waitOwned = runtime && oneShotWait ? ownedWait(runtime, oneShotWait) : nativeWait;
    this.started = undefined;
    this.dirty = false;
    for (const name of portNames) {
      if (environment[name]) allowOwnedEndpoint(`http://127.0.0.1:${environment[name]}`);
    }
  }

  async up(args: string[], environment: Environment = this.environment) {
    const services = args.filter((arg) => !arg.startsWith('-'));
    this.environment = {
      ...this.environment,
      ...environment,
      ...isolatedEnvironment,
    };
    // API readiness now authenticates to RabbitMQ, which Compose starts as its dependency.
    // Older database/API-only campaigns must also own these automatically started host ports.
    if (services.includes('api') || services.includes('web')) {
      for (const name of ['RABBITMQ_PORT', 'RABBITMQ_MANAGEMENT_PORT']) {
        if (!this.environment[name]) {
          const [port] = await allocatePorts(1);
          this.environment[name] = String(port);
        }
      }
    }
    this.dirty = true;
    let builder = this.create(
      root,
      this.preparedSearch
        ? ['compose.yaml', 'integration/fixtures/prepared-search.compose.yaml']
        : 'compose.yaml',
    )
      .withEnvironment(this.environment)
      .withProjectName(this.project)
      .withStartupTimeout(240_000)
      .withClientOptions({ commandOptions: ['--wait', '--wait-timeout', '240'] })
      .withWaitStrategy('migrations-1', Wait.forOneShotStartup());
    const profiles = (this.environment.COMPOSE_PROFILES || '').split(',').filter(Boolean);
    if (profiles.length) builder = builder.withProfiles(...profiles);
    if (args.includes('--build')) builder = builder.withBuild();
    try {
      this.started = await builder.up(services);
      return { stdout: '', stderr: '', exitCode: 0 };
    } catch (primary: unknown) {
      return preserveCleanup(
        async () => {
          throw primary;
        },
        () => this.down(),
      );
    }
  }

  async wait(services: string[], timeout = 180_000) {
    if (!services.length || services.some((service) => !/^[a-z0-9-]+$/.test(service)))
      throw new Error('Fixture waits require explicit owned service names.');
    // Include exited one-shot containers; the native strategy checks their actual exit state.
    await this.waitOwned(this.project, services, timeout);
    return { stdout: '', stderr: '', exitCode: 0 };
  }

  async down() {
    if (!this.dirty) return { stdout: '', stderr: '', exitCode: 0 };
    if (this.started) await this.started.down({ timeout: 120_000, removeVolumes: true });
    else
      await this.execute(
        'docker',
        [
          'compose',
          '--file',
          'compose.yaml',
          ...(this.preparedSearch
            ? ['--file', 'integration/fixtures/prepared-search.compose.yaml']
            : []),
          '--project-name',
          this.project,
          'down',
          '--volumes',
          '--remove-orphans',
        ],
        { cwd: root, env: this.environment, timeout: 120_000 },
      );
    // Verify exact ownership after cleanup, including setup failures before up() returns.
    for (const args of [
      ['ps', '--all', '--format', '{{.ID}}'],
      ['volume', 'ls', '--format', '{{.Name}}'],
    ]) {
      const result = await this.execute(
        'docker',
        [...args, '--filter', `label=com.docker.compose.project=${this.project}`],
        { cwd: root, env: this.environment, timeout: 30_000 },
      );
      if (result.stdout.trim())
        throw new Error(`Owned ${args[0]} resources remain after fixture teardown.`);
    }
    this.dirty = false;
    this.started = undefined;
    return { stdout: '', stderr: '', exitCode: 0 };
  }
}

export async function withCampaign<T>(
  work: (context: { command: Command }) => Promise<T>,
  fixtureOptions: { preparedSearch?: boolean } = {},
) {
  const fixtures = new Map<string, ComposeFixture>();
  const command: Command = async (file, args: string[], options = {}) => {
    const settings = { ...options, cwd: options.cwd || root, timeout: options.timeout || 300_000 };
    if (file === 'docker' && args[0] === 'compose') {
      const index = args.indexOf('--project-name');
      const project = index >= 0 ? args[index + 1] : settings.env?.COMPOSE_PROJECT_NAME;
      if (!project) throw new Error('Integration Compose commands must identify an owned project.');
      const operation = args.findIndex((arg) =>
        [
          'up',
          'down',
          'build',
          'run',
          'restart',
          'stop',
          'start',
          'pause',
          'unpause',
          'ps',
          'exec',
          'logs',
          'config',
          'wait',
        ].includes(arg),
      );
      let fixture = fixtures.get(project);
      if (!fixture) {
        fixture = new ComposeFixture(project, settings.env || {}, fixtureOptions);
        fixtures.set(project, fixture);
      }
      if (args[operation] === 'up')
        return fixture.up(args.slice(operation + 1), settings.env || {});
      if (args[operation] === 'down') return fixture.down();
      if (args[operation] === 'wait')
        return fixture.wait(args.slice(operation + 1), settings.timeout);
      // Real CLI invocations, migration stages and faults retain their production commands.
      const commandArgs = fixture.preparedSearch
        ? [
            ...args.slice(0, operation),
            '--file',
            'integration/fixtures/prepared-search.compose.yaml',
            ...args.slice(operation),
          ]
        : args;
      return execa(file, commandArgs, {
        ...settings,
        env: {
          ...fixture.environment,
          ...settings.env,
          ...isolatedEnvironment,
        },
      });
    }
    return execa(file, args, settings);
  };
  return preserveCleanup(
    () => work({ command }),
    async () => {
      const results = await Promise.allSettled(
        [...fixtures.values()].map((fixture) => fixture.down()),
      );
      const failures = results
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Owned fixture cleanup failed.');
    },
  );
}

/** Explicit compatibility fixture for campaigns authored against the prepared search catalog. */
export function withPreparedSearchCampaign<T>(work: (context: { command: Command }) => Promise<T>) {
  return withCampaign(work, { preparedSearch: true });
}
