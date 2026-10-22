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
  readonly privacyControllerName: string | null;
  readonly privacyContactEmail: string | null;
}

const DEFAULT_API_BASE_URL = '';

function optionalUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function controllerName(value: string | undefined): string | null {
  if (!value || hasControl(value) || /[<>]/.test(value)) return null;
  const name = value.trim();
  return name.length > 0 && name.length <= 200 ? name : null;
}

function contactEmail(value: string | undefined): string | null {
  if (!value || hasControl(value) || /\s/.test(value)) return null;
  if (value.length > 254) return null;
  const parts = value.split('@');
  const local = parts[0] ?? '';
  const domain = parts[1] ?? '';
  if (parts.length !== 2 || local.length > 64 || !/^[a-z0-9]+(?:[._+-][a-z0-9]+)*$/i.test(local))
    return null;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain) ? value : null;
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code < 32 || code === 127;
  });
}

export function readConfig(env: Record<string, string | undefined>): WebConfig {
  const configured = env.VITE_API_BASE_URL?.trim();

  return {
    apiBaseUrl: configured && configured.length > 0 ? configured : DEFAULT_API_BASE_URL,
    demoUrl: optionalUrl(env.VITE_DEMO_URL),
    repositoryUrl: optionalUrl(env.VITE_REPOSITORY_URL),
    privacyControllerName: controllerName(env.VITE_PRIVACY_CONTROLLER_NAME),
    privacyContactEmail: contactEmail(env.VITE_PRIVACY_CONTACT_EMAIL),
  };
}

export const config = readConfig(import.meta.env as unknown as Record<string, string | undefined>);
