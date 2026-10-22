import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';
import { preserveCleanup } from './cleanup.ts';
import {
  appendAccessibilityAttempt,
  inventoryFiles,
  sha256,
  writeAccessibilityEvidence,
} from './accessibility-evidence.ts';

test('source identity includes nested bytes; captures are immutable and attempts append', async () => {
  const directory = pathToFileURL((await mkdtemp(`${tmpdir()}/rei-a11y-evidence-`)) + '/');
  await preserveCleanup(
    async () => {
      await mkdir(new URL('src/nested/', directory), { recursive: true });
      await writeFile(new URL('src/nested/locale.ts', directory), 'public localized bytes');
      const inventory = await inventoryFiles(directory, ['src']);
      expect(inventory.files).toEqual([
        { file: 'src/nested/locale.ts', sha256: sha256('public localized bytes') },
      ]);
      const capture = await writeAccessibilityEvidence(directory, 'evidence/capture.json', {
        b: 2,
        a: 1,
      });
      expect(capture.sha256).toBe(sha256(await readFile(new URL(capture.file, directory))));
      await expect(
        writeAccessibilityEvidence(directory, capture.file, { replaced: true }),
      ).rejects.toMatchObject({ code: 'EEXIST' });
      const baseline = {
        kind: 'scenario' as const,
        executorError: false,
        reason: 'Unit-only serialization evidence',
        environmentEvidence: capture.file,
        verification: {
          expected: 'Append both entries',
          observed: 'Original bytes retained',
          comparison: 'Native assertion below',
        },
        scenarioId: 'A11Y-001',
        startedUtc: '2026-10-22T00:00:00.000Z',
        finishedUtc: '2026-10-22T00:00:01.000Z',
        evidence: [capture.file],
      };
      await appendAccessibilityAttempt(directory, {
        ...baseline,
        attemptId: 'first',
        status: 'failed',
        actionFailed: true,
      });
      await appendAccessibilityAttempt(directory, {
        ...baseline,
        attemptId: 'second',
        status: 'approved',
        actionFailed: false,
      });
      const lines = (await readFile(new URL('results/attempts.jsonl', directory), 'utf8'))
        .trim()
        .split('\n');
      expect(lines.map((line) => (JSON.parse(line) as { status: string }).status)).toEqual([
        'failed',
        'approved',
      ]);
      await writeFile(new URL('src/nested/locale.ts', directory), 'changed public bytes');
      expect((await inventoryFiles(directory, ['src'])).sha256).not.toBe(inventory.sha256);
    },
    () => rm(directory, { recursive: true }),
  );
});
