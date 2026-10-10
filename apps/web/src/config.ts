/**
 * Frontend configuration. The web application talks to the backend only over
 * the versioned HTTP contract, never to the database or to a vendor API.
 */
export interface WebConfig {
  readonly apiBaseUrl: string;
  /** Public demo address. Absent until a demo is published. */
  readonly demoUrl: string | null;
  /** Public source repository address. Absent when the repository is private. */
  readonly repositoryUrl: string | null;
}

const DEFAULT_API_BASE_URL = 'http://localhost:8200';

function optionalUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

export function readConfig(env: Record<string, string | undefined>): WebConfig {
  const configured = env.VITE_API_BASE_URL?.trim();

  return {
    apiBaseUrl: configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL,
    demoUrl: optionalUrl(env.VITE_DEMO_URL),
    repositoryUrl: optionalUrl(env.VITE_REPOSITORY_URL),
  };
}

export const config = readConfig(import.meta.env as unknown as Record<string, string | undefined>);
