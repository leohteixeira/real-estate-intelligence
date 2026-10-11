import type { DatabaseConnection } from '../../packages/infrastructure/dist/index.js';
import type { ComposeFixture } from './fixture.ts';

/** Capture operational evidence only: never retain questions, grants, credentials or payloads. */
export async function captureAskDiagnostics(
  fixture: ComposeFixture,
  database?: DatabaseConnection,
) {
  const runState = database
    ? await database
        .query(
          `SELECT id::text,state,execution_id::text,claim_expires_at,
          (SELECT count(*)::integer FROM ask.run_event e WHERE e.run_id=r.id) AS events,
          (SELECT count(*)::integer FROM ask.tool_receipt t WHERE t.run_id=r.id) AS receipts
         FROM ask.run r ORDER BY id`,
        )
        .catch(() => [{ diagnostic: 'database_unavailable' }])
    : [{ diagnostic: 'database_not_initialized' }];
  const owned = await fixture
    .execute(
      'docker',
      [
        'ps',
        '--all',
        '--filter',
        `label=com.docker.compose.project=${fixture.project}`,
        '--format',
        '{{.Names}}\t{{.Status}}',
      ],
      { timeout: 10000 },
    )
    .catch(() => ({ stdout: 'owned_container_status_unavailable' }));
  const logSignals: Record<string, string[]> = {};
  for (const service of ['api', 'ai', 'worker']) {
    const logs = await fixture
      .execute('docker', ['logs', '--tail', '200', `${fixture.project}-${service}-1`], {
        timeout: 10000,
        reject: false,
      })
      .catch(() => ({ stdout: '', stderr: '' }));
    // Retain only recognized operational labels, not the surrounding log text.
    logSignals[service] = `${logs.stdout}\n${logs.stderr ?? ''}`.split('\n').flatMap((line) => {
      const signal = line.match(
        /received SIGTERM|the worker started|database available: (?:true|false)|ECONNREFUSED|ETIMEDOUT|execution_unavailable|messaging_failed|Nest application successfully started/,
      );
      return signal ? [signal[0]] : [];
    });
  }
  process.stderr.write(
    `${JSON.stringify({ askDiagnostics: { project: fixture.project, owned: owned.stdout, runState, logSignals } })}\n`,
  );
}
