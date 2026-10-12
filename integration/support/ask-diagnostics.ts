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
          (SELECT count(*)::integer FROM ask.tool_receipt t WHERE t.run_id=r.id) AS receipts,
          (SELECT count(*)::integer FROM ask.graph_checkpoint c WHERE c.run_id=r.id) AS checkpoints,
          (SELECT count(*)::integer FROM ask.graph_pending_write w WHERE w.run_id=r.id) AS pending_writes,
          (graph_pruned_at IS NOT NULL) AS graph_pruned
         FROM ask.run r ORDER BY id`,
        )
        .catch(() => [{ diagnostic: 'database_unavailable' }])
    : [{ diagnostic: 'database_not_initialized' }];
  const graphProgress = database
    ? await database
        .query(
          `SELECT c.run_id::text,c.sequence,
          (convert_from(c.metadata_bytes,'UTF8')::jsonb->>'step')::integer AS step,
          ARRAY(SELECT channel FROM jsonb_object_keys(convert_from(c.checkpoint_bytes,'UTF8')::jsonb->'channel_values') AS channel WHERE channel IN ('__start__','input','decision','visitedNodes','receipt','branch:to:validatedInputs','branch:to:fixedDecision','branch:to:priceTool') ORDER BY channel) AS channels,
          ARRAY(SELECT channel FROM ask.graph_pending_write w WHERE w.run_id=c.run_id AND w.namespace=c.namespace AND w.checkpoint_id=c.checkpoint_id AND channel IN ('__start__','input','decision','visitedNodes','receipt','branch:to:validatedInputs','branch:to:fixedDecision','branch:to:priceTool','__error__','__interrupt__') ORDER BY task_id,write_index) AS pending_channels
          FROM ask.graph_checkpoint c WHERE c.checkpoint_type='json' AND c.metadata_type='json' ORDER BY c.run_id,c.sequence`,
        )
        .catch(() => [{ diagnostic: 'graph_progress_unavailable' }])
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
  const queues = await fixture
    .execute(
      'docker',
      [
        'exec',
        `${fixture.project}-rabbitmq-1`,
        'rabbitmqctl',
        'list_queues',
        '-p',
        fixture.environment.RABBITMQ_VHOST ?? 'real-estate-intelligence',
        'name',
        'messages_ready',
        'messages_unacknowledged',
      ],
      { timeout: 10000, reject: false },
    )
    .catch(() => ({ stdout: '' }));
  const askQueues = queues.stdout
    .split('\n')
    .filter((line) => /^ask\.[a-z0-9.-]+\t[0-9]+\t[0-9]+$/.test(line));
  for (const service of ['api', 'ai', 'worker']) {
    const logs = await fixture
      .execute('docker', ['logs', '--tail', '200', `${fixture.project}-${service}-1`], {
        timeout: 10000,
        reject: false,
      })
      .catch(() => ({ stdout: '', stderr: '' }));
    // Retain only recognized operational labels, not the surrounding log text.
    logSignals[service] = `${logs.stdout}\n${logs.stderr ?? ''}`.split('\n').flatMap((line) => {
      const safeFailure = line.match(
        /\{"event":"ask\.execution\.unavailable","category":"(?:transient|rejected|cancelled)","source":"(?:saver|http-status|http-invalid|http-forbidden|http-conflict|http-envelope|canonical-schema|canonical-values|price-tool|execution)"(?:,"operation":"(?:get|list|put|put-writes)")?\}/,
      );
      if (safeFailure) return [safeFailure[0]];
      const signal = line.match(
        /received SIGTERM|the worker started|database available: (?:true|false)|ECONNREFUSED|ETIMEDOUT|execution_unavailable|messaging_failed|Nest application successfully started/,
      );
      return signal ? [signal[0]] : [];
    });
  }
  process.stderr.write(
    `${JSON.stringify({ askDiagnostics: { project: fixture.project, owned: owned.stdout, runState, graphProgress, askQueues, logSignals } })}\n`,
  );
}
