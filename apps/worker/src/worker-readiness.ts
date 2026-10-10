import { rm, writeFile } from 'node:fs/promises';

export const WORKER_READINESS_MARKER = '/tmp/real-estate-intelligence-worker-ready';

export async function clearWorkerReadiness(markerPath = WORKER_READINESS_MARKER): Promise<void> {
  await rm(markerPath, { force: true });
}

export async function markWorkerReady(markerPath = WORKER_READINESS_MARKER): Promise<void> {
  await writeFile(markerPath, 'ready\n', 'utf8');
}
