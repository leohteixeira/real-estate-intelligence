import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { clearWorkerReadiness, markWorkerReady } from './worker-readiness';

describe('worker readiness marker', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) {
      await rm(directory, { force: true, recursive: true });
      directory = undefined;
    }
  });

  it('clears stale readiness before creating a fresh marker', async () => {
    directory = await mkdtemp(join(tmpdir(), 'rei-worker-readiness-'));
    const markerPath = join(directory, 'ready');
    await writeFile(markerPath, 'stale\n', 'utf8');

    await clearWorkerReadiness(markerPath);
    await expect(readFile(markerPath, 'utf8')).rejects.toThrow();

    await markWorkerReady(markerPath);
    await expect(readFile(markerPath, 'utf8')).resolves.toBe('ready\n');
  });
});
