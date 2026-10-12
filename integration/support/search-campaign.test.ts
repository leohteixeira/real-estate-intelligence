import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { expect, test, vi } from 'vitest';
import { copySurfaceEvidence, runSearchCampaign } from './search-campaign.ts';
import { preserveCleanup } from './cleanup.ts';

test('surface JSON hashes survive the exact repository formatter and image bytes stay unchanged', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rei-search-evidence-'));
  await preserveCleanup(
    async () => {
      const source = pathToFileURL(join(directory, 'surface.json'));
      const target = pathToFileURL(join(directory, 'retained.json'));
      const config = await resolveConfig(
        new URL('../../.prettierrc.json', import.meta.url).pathname,
      );
      const content = JSON.stringify(
        {
          keyboard: { actions: ['Focus', 'Enter'], open: true },
          targets: [{ label: 'Apply', height: 44 }],
        },
        null,
        2,
      );
      await writeFile(source, content);
      const digest = await copySurfaceEvidence(source, target);
      const bytes = await readFile(target, 'utf8');
      expect(bytes).toBe(await format(content, { ...config, filepath: target.pathname }));
      expect(await readFile(source, 'utf8')).toBe(bytes);
      expect(
        createHash('sha256')
          .update(await format(bytes, { ...config, filepath: target.pathname }))
          .digest('hex'),
      ).toBe(digest);
      const image = pathToFileURL(join(directory, 'surface.png'));
      const retainedImage = pathToFileURL(join(directory, 'retained.png'));
      const imageBytes = Buffer.from([137, 80, 78, 71, 0, 255, 10]);
      await writeFile(image, imageBytes);
      expect(await copySurfaceEvidence(image, retainedImage)).toBe(
        createHash('sha256').update(imageBytes).digest('hex'),
      );
      expect(await readFile(retainedImage)).toEqual(imageBytes);
    },
    () => rm(directory, { recursive: true }),
  );
});

test('work, browser and reporting failures survive together and later reporting still runs', async () => {
  const primary = new AggregateError(
    [new Error('assertion'), new Error('Compose teardown')],
    'primary',
  );
  const browser = new Error('browser');
  const report = new Error('report');
  const campaign = { status: 'running', stackTornDownUtc: null as string | null };
  const finalReport = vi.fn(async () => {
    expect(campaign.status).toBe('failed');
    expect(campaign.stackTornDownUtc).toBeNull();
  });
  await expect(
    runSearchCampaign(
      async () => {
        throw primary;
      },
      campaign,
      async () => {
        throw browser;
      },
      async () => {
        throw report;
      },
      finalReport,
    ),
  ).rejects.toMatchObject({ errors: [primary, { errors: [browser, report] }] });
  expect(finalReport).toHaveBeenCalledOnce();
});

test('only successful work and owned teardown produce a removal timestamp', async () => {
  const campaign = { status: 'running', stackTornDownUtc: null as string | null };
  const report = vi.fn(async () => {
    expect(campaign.status).toBe('complete');
    expect(campaign.stackTornDownUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  await runSearchCampaign(async () => {}, campaign, report);
  expect(report).toHaveBeenCalledOnce();
});

test('falsy primary throws are preserved and cleanup failures never erase confirmed teardown', async () => {
  const failed = { status: 'running', stackTornDownUtc: null as string | null };
  await expect(
    runSearchCampaign(
      async () => {
        throw undefined;
      },
      failed,
      async () => {
        throw null;
      },
    ),
  ).rejects.toMatchObject({ errors: [undefined, { errors: [null] }] });
  expect(failed.stackTornDownUtc).toBeNull();
  const complete = { status: 'running', stackTornDownUtc: null as string | null };
  await expect(
    runSearchCampaign(
      async () => {},
      complete,
      async () => {
        throw new Error('report');
      },
    ),
  ).rejects.toThrow('Resource cleanup failed');
  expect(complete.stackTornDownUtc).not.toBeNull();
});
