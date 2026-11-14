import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { expect } from 'vitest';
import { writeAccessibilityEvidence } from './accessibility-evidence.ts';
import { askDockerInventory } from './ask-web-evidence.ts';
import { cleanupAll } from './cleanup.ts';
import { allocatePorts, ComposeFixture } from './fixture.ts';
import { allowOwnedEndpoint } from './network.ts';

interface StartedStack {
  readonly base: string;
  readonly databaseUrl: string;
}

/**
 * One owned production stack for every accessibility partition a Vitest worker runs.
 *
 * Partitions only read: each one proves it with its own SQL readback, write-refusing browser
 * route and fresh browser profile, so a fresh PostgreSQL volume per partition bought no isolation
 * and cost a full Compose boot each time. The stack starts with the first partition that asks
 * for it and is removed, with its own receipt, after the last one.
 */
export function accessibilityStack() {
  const runId = `accessibility-stack-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const project = `rei-web-accessibility-${randomUUID()}`;
  const receipt = `campaigns/${runId}/teardown.json`;
  const partitions: string[] = [];
  let fixture: ComposeFixture | undefined;
  let foreign: Awaited<ReturnType<typeof askDockerInventory>> | undefined;
  let starting: Promise<StartedStack> | undefined;
  let startedUtc: string | undefined;

  async function start(): Promise<StartedStack> {
    foreign = await askDockerInventory();
    const [postgres, api, web] = await allocatePorts(3);
    const settings = {
      NODE_ENV: 'test',
      POSTGRES_DB: 'rei_accessibility',
      POSTGRES_USER: 'rei_accessibility',
      POSTGRES_PASSWORD: 'controlled-accessibility-fixture',
      POSTGRES_PORT: String(postgres),
      API_PORT: String(api),
      WEB_PORT: String(web),
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      VITE_PRIVACY_CONTROLLER_NAME: '',
      VITE_PRIVACY_CONTACT_EMAIL: '',
    };
    fixture = new ComposeFixture(project, settings, { preparedSearch: true });
    await fixture.up(['--build', 'postgres', 'migrations', 'api', 'web']);
    const database = new URL(`postgres://127.0.0.1:${postgres}/${settings.POSTGRES_DB}`);
    database.username = settings.POSTGRES_USER;
    database.password = settings.POSTGRES_PASSWORD;
    startedUtc = new Date().toISOString();
    return { base: `http://127.0.0.1:${web}`, databaseUrl: database.toString() };
  }

  return {
    project,
    /** Path of the stack's removal receipt, relative to the review evidence root. */
    receipt,
    /** Start on first use; a failed start is retried by the next partition. */
    async acquire(partitionRunId: string): Promise<StartedStack> {
      starting ??= start().catch((error: unknown) => {
        starting = undefined;
        throw error;
      });
      const started = await starting;
      // The network guard forgets owned hosts before every native test.
      allowOwnedEndpoint(started.base);
      partitions.push(partitionRunId);
      return started;
    },
    /** Remove the stack, prove nothing foreign was touched and leave the receipt. */
    async release(): Promise<void> {
      if (!fixture) return;
      let ownedResourcesRemoved = false;
      let foreignResourcesPreserved = false;
      const directory = new URL(
        `../../apps/web/.impeccable/review/campaigns/${runId}/`,
        import.meta.url,
      );
      await cleanupAll(
        async () => {
          await fixture!.down();
          ownedResourcesRemoved = true;
        },
        async () => {
          const after = await askDockerInventory();
          expect(after.containers).toEqual(expect.arrayContaining(foreign!.containers));
          expect(after.volumes).toEqual(expect.arrayContaining(foreign!.volumes));
          foreignResourcesPreserved = true;
        },
        async () => {
          await mkdir(directory, { recursive: true });
          await writeAccessibilityEvidence(directory, 'teardown.json', {
            project,
            startedUtc,
            partitions,
            ownedResourcesRemoved,
            foreignResourcesPreserved,
            at: new Date().toISOString(),
          });
        },
      );
    },
  };
}
