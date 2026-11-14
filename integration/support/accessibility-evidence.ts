import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import { execa } from 'execa';
import { expect } from 'vitest';
import { askVersion } from './ask-web-evidence.ts';
import { requestHttp } from './http.ts';

export const sha256 = (bytes: string | Uint8Array) =>
  createHash('sha256').update(bytes).digest('hex');

/** Explicit roots, no ignored/secret files, sorted paths and exact bytes. */
export async function inventoryFiles(root: URL, paths: readonly string[]) {
  const files: Array<{ file: string; sha256: string }> = [];
  async function visit(path: string): Promise<void> {
    if (
      path
        .split('/')
        .some((part) => /^\.env(?:\.|$)/.test(part) || ['node_modules', '.git'].includes(part))
    )
      return;
    const location = new URL(path, root);
    const entries = await readdir(location, { withFileTypes: true }).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOTDIR') return null;
      throw error;
    });
    if (entries) {
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isSymbolicLink()) await visit(`${path.replace(/\/$/, '')}/${entry.name}`);
      }
    } else files.push({ file: path, sha256: sha256(await readFile(location)) });
  }
  for (const path of paths) await visit(path);
  files.sort((a, b) => a.file.localeCompare(b.file));
  return { files, sha256: sha256(JSON.stringify(files)) };
}

export async function accessibilityVersion(project: string, base: string) {
  const root = new URL('../../', import.meta.url);
  const { commit, dirty, runtime, runtimeAssets } = await askVersion(project, base);
  const source = await inventoryFiles(root, [
    'apps/web/src',
    'apps/web/index.html',
    'apps/web/DESIGN.md',
    'apps/web/package.json',
    'apps/web/vite.config.ts',
    'apps/web/tsconfig.json',
    'packages/contracts/src',
    'packages/contracts/package.json',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.base.json',
    'compose.yaml',
    '.dockerignore',
    'docker/web.Dockerfile',
    'docker/web-nginx.conf',
    'docker/api.Dockerfile',
  ]);
  const backend = await inventoryFiles(root, [
    'apps/api/dist',
    'packages/domain/dist',
    'packages/application/dist',
    'packages/infrastructure/dist',
    'packages/contracts/dist',
  ]);
  const executor = await inventoryFiles(root, [
    'integration/web-accessibility.integration.test.ts',
    'integration/support',
    'vitest.integration.config.ts',
    'tsconfig.integration.json',
  ]);
  const servedAssets = [];
  for (const asset of runtimeAssets) {
    const response = await requestHttp(`${base}/assets/${asset.file}`);
    expect(response.status).toBe(200);
    const digest = sha256(await response.text());
    expect(digest).toBe(asset.sha256);
    servedAssets.push({ file: asset.file, sha256: digest });
  }
  const runtimeFiles = [];
  for (const service of ['api', 'web']) {
    const id = (
      await execa('docker', [
        'ps',
        '--quiet',
        '--filter',
        `label=com.docker.compose.project=${project}`,
        '--filter',
        `label=com.docker.compose.service=${service}`,
      ])
    ).stdout.trim();
    expect(id).not.toBe('');
    expect(id.split('\n')).toHaveLength(1);
    const checksums = (
      await execa('docker', [
        'exec',
        id,
        'find',
        // The prepared-search fixture runs the API image's build stage from /source.
        service === 'api' ? '/source/apps/api/dist' : '/srv/rei',
        '-type',
        'f',
        '-exec',
        'sha256sum',
        '{}',
        '+',
      ])
    ).stdout
      .split('\n')
      .filter(Boolean)
      .sort();
    for (const checksum of checksums) {
      const [hash, path] = checksum.split(/\s+/);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
      runtimeFiles.push({ service, path: path!, sha256: hash! });
    }
  }
  return {
    scope:
      'Whole delivered MVP, owned production images and exact HTTP-served JS/CSS; no deployed identity claimed',
    commit,
    dirty,
    source,
    backend,
    executor,
    runtime,
    runtimeFiles,
    runtimeAssets,
    servedAssets,
    base,
  };
}

/** Immutable captures are formatted before hashing. An existing path is never overwritten. */
export async function writeAccessibilityEvidence(directory: URL, name: string, value: unknown) {
  const target = new URL(name, directory);
  await mkdir(new URL('.', target), { recursive: true });
  const bytes = await format(JSON.stringify(value), {
    ...(await resolveConfig(target.pathname)),
    filepath: target.pathname,
  });
  await writeFile(target, bytes, { flag: 'wx' });
  return { file: name, sha256: sha256(bytes) };
}

export async function appendAccessibilityAttempt(
  directory: URL,
  attempt: {
    attemptId: string;
    scenarioId: string;
    status: 'approved' | 'failed' | 'inconclusive';
    kind: 'pilot' | 'scenario';
    executorError: boolean;
    reason: string;
    environmentEvidence: string;
    finalUiEvidence?: string;
    verification: { expected: string; observed: string; comparison: string };
    startedUtc: string;
    finishedUtc: string;
    evidence: readonly string[];
    actionFailed: boolean;
  },
) {
  await mkdir(new URL('results/', directory), { recursive: true });
  await appendFile(new URL('results/attempts.jsonl', directory), JSON.stringify(attempt) + '\n');
}
