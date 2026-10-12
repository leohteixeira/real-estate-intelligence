import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { cleanupAll, preserveCleanup } from './cleanup.ts';

/** Commit hooks must not change the bytes covered by a surface manifest. */
export async function copySurfaceEvidence(source: URL, target: URL): Promise<string> {
  if (source.pathname.endsWith('.json')) {
    const raw = await readFile(source, 'utf8');
    const formatted = await format(raw, {
      ...(await resolveConfig(source.pathname)),
      filepath: source.pathname,
    });
    await writeFile(source, formatted);
  }
  await copyFile(source, target);
  return createHash('sha256')
    .update(await readFile(target))
    .digest('hex');
}

interface CampaignOutcome {
  status: string;
  stackTornDownUtc: string | null;
}

/** Work includes owned Compose teardown; a rejected teardown is never a removal receipt. */
export async function runSearchCampaign(
  work: () => Promise<unknown>,
  campaign: CampaignOutcome,
  ...cleanup: Array<() => Promise<unknown>>
): Promise<void> {
  await preserveCleanup(
    async () => {
      try {
        await work();
        campaign.stackTornDownUtc = new Date().toISOString();
        campaign.status = 'complete';
      } catch (error) {
        campaign.status = 'failed';
        throw error;
      }
    },
    () => cleanupAll(...cleanup),
  );
}
