import { cleanupAll, preserveCleanup } from './cleanup.ts';
import { runSearchCampaign } from './search-campaign.ts';

interface AskCampaignOutcome {
  status: string;
  stackTornDownUtc: string | null;
}

export interface AskTeardownReceipt {
  ownedResourcesRemoved: boolean;
  foreignResourcesPreserved: boolean;
  at: string | null;
}

/** Report independent cleanup facts, including when work or owned teardown rejects. */
export async function runAskCampaign(
  work: () => Promise<unknown>,
  campaign: AskCampaignOutcome,
  lifecycle: {
    release: Array<() => Promise<unknown>>;
    down: () => Promise<unknown>;
    verifyForeignResources: () => Promise<unknown>;
    report: (receipt: AskTeardownReceipt) => Promise<unknown>;
  },
): Promise<void> {
  let ownedResourcesRemoved = false;
  let foreignResourcesPreserved = false;
  await runSearchCampaign(
    () =>
      preserveCleanup(work, () =>
        cleanupAll(...lifecycle.release, async () => {
          await lifecycle.down();
          ownedResourcesRemoved = true;
          campaign.stackTornDownUtc = new Date().toISOString();
        }),
      ),
    campaign,
    () =>
      preserveCleanup(
        async () => {
          try {
            await lifecycle.verifyForeignResources();
            foreignResourcesPreserved = true;
          } catch (error) {
            campaign.status = 'failed';
            throw error;
          }
        },
        () =>
          lifecycle.report({
            ownedResourcesRemoved,
            foreignResourcesPreserved,
            at: campaign.stackTornDownUtc,
          }),
      ),
  );
}
