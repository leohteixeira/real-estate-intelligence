import { randomBytes, randomUUID } from 'node:crypto';
import { execa } from 'execa';
import { expect, test } from 'vitest';
import {
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseRunExecutionEvidence,
} from '../packages/contracts/dist/index.js';
import { DatabaseConnection } from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

const input = {
  version: 1,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation',
  query: 'private-synthetic-run-executor-question',
  locale: 'en',
} as const;
async function inventory() {
  const containers = await execa('docker', ['ps', '--all', '--format', '{{.ID}}']);
  const volumes = await execa('docker', ['volume', 'ls', '--format', '{{.Name}}']);
  return {
    containers: containers.stdout.split('\n').filter(Boolean).sort(),
    volumes: volumes.stdout.split('\n').filter(Boolean).sort(),
  };
}
async function databaseState(connection: DatabaseConnection) {
  const tables = await connection.query<{ table_schema: string; table_name: string }>(
    "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('properties','collection','platform','locations','market','ask','comparables','identity','audit','alerts','public') AND table_type='BASE TABLE' ORDER BY table_schema,table_name",
  );
  const result = [];
  for (const { table_schema: schema, table_name: table } of tables) {
    expect(schema).toMatch(/^[a-z_]+$/);
    expect(table).toMatch(/^[a-z_]+$/);
    const rows = await connection.query<{ count: number; digest: string }>(
      `SELECT count(*)::integer AS count,md5(COALESCE(string_agg(to_jsonb(record)::text,'' ORDER BY to_jsonb(record)::text),'')) AS digest FROM "${schema}"."${table}" record`,
    );
    result.push({ schema, table, ...rows[0] });
  }
  return result;
}
async function withExecutionFixture(
  work: (context: { ai: string; token: string; fixture: ComposeFixture }) => Promise<void>,
) {
  const [postgresPort, apiPort, aiPort] = await allocatePorts(3);
  const token = randomBytes(32).toString('base64url');
  const fixture = new ComposeFixture(`rei-run-executor-${randomUUID()}`, {
    POSTGRES_PORT: String(postgresPort),
    API_PORT: String(apiPort),
    AI_PORT: String(aiPort),
    POSTGRES_USER: 'rei_run_fixture',
    POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
    POSTGRES_DB: 'rei_run_fixture',
    AI_INTERNAL_TOKEN: token,
    NODE_ENV: 'test',
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  });
  const foreign = await inventory();
  let connection: DatabaseConnection | undefined;
  await preserveCleanup(
    async () => {
      await fixture.up(['--build', 'postgres', 'migrations', 'api', 'ai']);
      const url = new URL(`postgres://127.0.0.1:${postgresPort}/rei_run_fixture`);
      url.username = fixture.environment.POSTGRES_USER!;
      url.password = fixture.environment.POSTGRES_PASSWORD!;
      connection = new DatabaseConnection(url.toString());
      const before = await databaseState(connection);
      const api = `http://127.0.0.1:${apiPort}`;
      const availability = parseAskAvailability(
        await (await requestHttp(`${api}/api/v1/ask/capabilities`)).json(),
      );
      const catalogue = parseAskFixtureCatalogue(
        await (await requestHttp(`${api}/api/v1/ask/fixtures`)).json(),
      );
      await work({ ai: `http://127.0.0.1:${aiPort}`, token, fixture });
      expect(await databaseState(connection)).toStrictEqual(before);
      expect(
        parseAskAvailability(await (await requestHttp(`${api}/api/v1/ask/capabilities`)).json()),
      ).toStrictEqual(availability);
      expect(
        parseAskFixtureCatalogue(await (await requestHttp(`${api}/api/v1/ask/fixtures`)).json()),
      ).toStrictEqual(catalogue);
      expect(availability.metadata.liveExecution).toBe(false);
      const logs = await fixture.execute(
        'docker',
        [
          'compose',
          '--file',
          'compose.yaml',
          '--project-name',
          fixture.project,
          'logs',
          '--no-color',
          'ai',
        ],
        { env: fixture.environment },
      );
      expect(logs.stdout).not.toContain(token);
      expect(logs.stdout).not.toContain(input.query);
      const isolation = await fixture.execute(
        'docker',
        [
          'compose',
          '--file',
          'compose.yaml',
          '--project-name',
          fixture.project,
          'exec',
          '-T',
          'ai',
          'node',
          '-e',
          "let infrastructure=false;try{require.resolve('@rei/infrastructure');infrastructure=true}catch{};console.log(JSON.stringify({infrastructure,credentials:['DATABASE_URL','RABBITMQ_URL','OBJECT_STORE_ACCESS_KEY_ID','OBJECT_STORE_SECRET_ACCESS_KEY'].some(key=>Boolean(process.env[key]))}))",
        ],
        { env: fixture.environment },
      );
      const isolationEvidence: unknown = JSON.parse(isolation.stdout);
      expect(isolationEvidence).toStrictEqual({ infrastructure: false, credentials: false });
    },
    () =>
      cleanupAll(
        async () => connection?.close(),
        () => fixture.down(),
        async () => {
          const after = await inventory();
          expect(after.containers).toEqual(expect.arrayContaining(foreign.containers));
          expect(after.volumes).toEqual(expect.arrayContaining(foreign.volumes));
        },
      ),
  );
}

test('RunExecutor HTTP boundary: real AI authentication, strict input and safe foundation evidence', async () => {
  await withExecutionFixture(async ({ ai, token, fixture }) => {
    const endpoint = `${ai}/internal/v1/runs/execute`;
    expect((await requestHttp(`${ai}/health`)).status).toBe(200);
    for (const authorization of [
      '',
      `Bearer ${randomBytes(32).toString('base64url')}`,
      `bearer ${token}`,
    ]) {
      const response = await requestHttp(endpoint, {
        method: 'POST',
        headers: { authorization, 'content-type': 'application/json' },
        body: '{malformed-private-question',
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toStrictEqual({ code: 'unauthorized' });
    }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const valid = await requestHttp(endpoint, { method: 'POST', headers, body: input });
    expect(valid.status).toBe(200);
    expect(parseRunExecutionEvidence(await valid.json())).toStrictEqual({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
    for (const body of [
      { ...input, extra: input.query },
      { ...input, query: ' ' },
      { ...input, query: 'x'.repeat(16001) },
      { ...input, version: 2 },
      '{malformed',
    ]) {
      const response = await requestHttp(endpoint, { method: 'POST', headers, body });
      expect(response.status).toBe(400);
      expect(await response.json()).toStrictEqual({ code: 'bad_request' });
    }
    const oversized = await requestHttp(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...input, query: 'x'.repeat(100001) }),
    });
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toStrictEqual({ code: 'bad_request' });
    const wrongType = await requestHttp(endpoint, {
      method: 'POST',
      headers: { authorization: headers.authorization, 'content-type': 'text/plain' },
      body: input.query,
    });
    expect(wrongType.status).toBe(415);
    expect(await wrongType.json()).toStrictEqual({ code: 'unsupported_media_type' });
    const disabled = await fixture.execute(
      'docker',
      [
        'compose',
        '--file',
        'compose.yaml',
        '--project-name',
        fixture.project,
        'run',
        '--rm',
        '--no-deps',
        '-T',
        '--env',
        'AI_INTERNAL_TOKEN=',
        'ai',
        'node',
        '-e',
        "const {readConfig}=require('./dist/config');console.log(JSON.stringify({disabled:readConfig(process.env).internalToken===undefined}))",
      ],
      { env: fixture.environment },
    );
    expect(JSON.parse(disabled.stdout)).toStrictEqual({ disabled: true });
  });
});

test('RunExecutor E2E: production worker command resolves Nest port and traverses the real AI graph', async () => {
  await withExecutionFixture(async ({ token, fixture }) => {
    const compose = [
      'compose',
      '--file',
      'compose.yaml',
      '--project-name',
      fixture.project,
      '--profile',
      'tools',
    ];
    await fixture.execute('docker', [...compose, 'build', 'run-execution-command'], {
      env: fixture.environment,
      timeout: 240000,
    });
    const command = [...compose, 'run', '--rm', '--no-deps', '-T', 'run-execution-command'];
    const run = await fixture.execute('docker', command, {
      env: fixture.environment,
      input: JSON.stringify(input),
      timeout: 20000,
      reject: false,
    });
    expect(run.exitCode).toBe(0);
    expect(parseRunExecutionEvidence(JSON.parse(run.stdout.trim()))).toMatchObject({
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
    expect(`${run.stdout}${run.stderr}`).not.toContain(token);
    expect(`${run.stdout}${run.stderr}`).not.toContain(input.query);
    for (const internalToken of ['', randomBytes(32).toString('base64url')]) {
      const refused = await fixture.execute('docker', command, {
        env: { ...fixture.environment, AI_INTERNAL_TOKEN: internalToken },
        input: JSON.stringify(input),
        timeout: 20000,
        reject: false,
      });
      expect(refused.exitCode).toBe(1);
      expect(refused.stdout.trim()).toBe('');
      expect(JSON.parse(refused.stderr!.trim())).toStrictEqual({
        code: 'foundation_execution_failed',
        kind: internalToken ? 'unauthorized' : 'rejected',
      });
      expect(refused.stderr).not.toContain(input.query);
      if (internalToken) expect(refused.stderr).not.toContain(internalToken);
    }
  });
});
