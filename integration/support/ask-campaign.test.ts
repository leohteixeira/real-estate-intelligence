import { expect, test, vi } from 'vitest';
import { runAskCampaign, type AskTeardownReceipt } from './ask-campaign.ts';

test('a rejected owned down writes a failed outcome, never a successful removal receipt', async () => {
  const downFailure = new Error('owned Compose down rejected');
  const campaign = { status: 'running', stackTornDownUtc: null as string | null };
  const verifyForeignResources = vi.fn(async () => {});
  const report = vi.fn(async (receipt: AskTeardownReceipt) => {
    expect(campaign).toEqual({ status: 'failed', stackTornDownUtc: null });
    expect(receipt).toEqual({
      ownedResourcesRemoved: false,
      foreignResourcesPreserved: true,
      at: null,
    });
  });
  await expect(
    runAskCampaign(async () => {}, campaign, {
      release: [],
      down: async () => {
        expect(campaign.status).toBe('running');
        throw downFailure;
      },
      verifyForeignResources,
      report,
    }),
  ).rejects.toMatchObject({ errors: [downFailure] });
  expect(verifyForeignResources).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledOnce();
  expect(campaign).toEqual({ status: 'failed', stackTornDownUtc: null });
});

test('work, resource releases, down, inventory and reporting failures all survive', async () => {
  const primary = new Error('work');
  const browser = new Error('browser close');
  const down = new Error('Compose down');
  const inventory = new Error('foreign inventory');
  const reportFailure = new Error('receipt write');
  const campaign = { status: 'running', stackTornDownUtc: null as string | null };
  const connection = vi.fn(async () => {});
  const report = vi.fn(async (receipt: AskTeardownReceipt) => {
    expect(campaign.status).toBe('failed');
    expect(receipt).toEqual({
      ownedResourcesRemoved: false,
      foreignResourcesPreserved: false,
      at: null,
    });
    throw reportFailure;
  });
  await expect(
    runAskCampaign(
      async () => {
        throw primary;
      },
      campaign,
      {
        release: [
          async () => {
            throw browser;
          },
          connection,
        ],
        down: async () => {
          throw down;
        },
        verifyForeignResources: async () => {
          throw inventory;
        },
        report,
      },
    ),
  ).rejects.toMatchObject({
    errors: [
      { errors: [primary, { errors: [browser, down] }] },
      { errors: [{ errors: [inventory, reportFailure] }] },
    ],
  });
  expect(connection).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledOnce();
});

test('successful owned teardown remains a separate fact when work fails', async () => {
  const primary = new Error('assertion');
  const campaign = { status: 'running', stackTornDownUtc: null as string | null };
  const report = vi.fn(async (receipt: AskTeardownReceipt) => {
    expect(campaign.status).toBe('failed');
    expect(receipt).toEqual({
      ownedResourcesRemoved: true,
      foreignResourcesPreserved: true,
      at: campaign.stackTornDownUtc,
    });
    expect(receipt.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  await expect(
    runAskCampaign(
      async () => {
        throw primary;
      },
      campaign,
      {
        release: [],
        down: async () => {},
        verifyForeignResources: async () => {},
        report,
      },
    ),
  ).rejects.toBe(primary);
  expect(report).toHaveBeenCalledOnce();
});

test('only successful work, releases, down and foreign inventory report complete', async () => {
  const campaign = { status: 'running', stackTornDownUtc: null as string | null };
  const report = vi.fn(async (receipt: AskTeardownReceipt) => {
    expect(campaign.status).toBe('complete');
    expect(receipt.ownedResourcesRemoved).toBe(true);
    expect(receipt.foreignResourcesPreserved).toBe(true);
    expect(receipt.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  await runAskCampaign(async () => {}, campaign, {
    release: [],
    down: async () => {},
    verifyForeignResources: async () => {},
    report,
  });
  expect(report).toHaveBeenCalledOnce();
});

test('a foreign inventory failure writes failed without erasing confirmed owned removal', async () => {
  const inventory = new Error('foreign inventory changed');
  const campaign = { status: 'running', stackTornDownUtc: null as string | null };
  const report = vi.fn(async (receipt: AskTeardownReceipt) => {
    expect(campaign.status).toBe('failed');
    expect(receipt.ownedResourcesRemoved).toBe(true);
    expect(receipt.foreignResourcesPreserved).toBe(false);
    expect(receipt.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  await expect(
    runAskCampaign(async () => {}, campaign, {
      release: [],
      down: async () => {},
      verifyForeignResources: async () => {
        throw inventory;
      },
      report,
    }),
  ).rejects.toMatchObject({ errors: [inventory] });
  expect(report).toHaveBeenCalledOnce();
});
