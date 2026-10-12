import { AskLiveError } from '@rei/application';
import { parseAskLiveRun } from '@rei/contracts';
import type { AskRequestedIdentity } from '@rei/domain';
import type { DatabaseClient } from '../shared/persistence/database-connection.js';
import { askDigest, equalAskDigest } from './ask-authority.js';

export async function lockAskThread(client: DatabaseClient, threadId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ask:${threadId}`]);
}
/** The caller holds the thread lock, shared with claims and terminal mutations. */
export async function authorizeAskExecution(
  client: DatabaseClient,
  identity: AskRequestedIdentity & { readonly executionId: string },
  authority?: { readonly scope: 'tool' | 'checkpoint'; readonly grant: string },
) {
  const rows = await client.query<{
    document: unknown;
    requested_event_id: string;
    execution_id: string | null;
    active: boolean;
    grant_digest: string | null;
    checkpoint_grant_digest: string | null;
  }>(
    `SELECT document,requested_event_id::text,execution_id::text,
    (state='running' AND claim_expires_at>clock_timestamp()) AS active,
    grant_digest,checkpoint_grant_digest FROM ask.run WHERE id=$1`,
    [identity.runId],
  );
  const row = rows[0];
  if (
    !row ||
    !row.active ||
    row.execution_id !== identity.executionId ||
    row.requested_event_id !== identity.eventId
  )
    throw new AskLiveError('forbidden');
  const run = parseAskLiveRun(row.document);
  if (run.threadId !== identity.threadId || run.id !== identity.runId)
    throw new AskLiveError('forbidden');
  if (authority) {
    const digest = authority.scope === 'tool' ? row.grant_digest : row.checkpoint_grant_digest;
    if (!digest || !equalAskDigest(digest, askDigest(authority.grant)))
      throw new AskLiveError('forbidden');
  }
  return run;
}
