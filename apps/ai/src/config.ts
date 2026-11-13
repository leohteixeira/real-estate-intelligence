import { z } from 'zod';

export interface AiConfig {
  port: number;
  internalToken?: string;
  apiBaseUrl?: string;
  tracerDeadlineMs?: number;
  anthropicApiKey?: string;
}

const DEFAULT_PORT = 4111;
const portSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

export function readConfig(env: NodeJS.ProcessEnv): AiConfig {
  const rawPort = env.AI_PORT?.trim();
  const token = env.AI_INTERNAL_TOKEN;
  if (token !== undefined && token !== '' && !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    throw new Error('Invalid AI execution configuration.');
  }
  let apiBaseUrl: string | undefined;
  if (env.API_BASE_URL) {
    try {
      const url = new URL(env.API_BASE_URL);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash
      )
        throw new Error();
      apiBaseUrl = url.origin;
    } catch {
      throw new Error('Invalid AI tool configuration.');
    }
  }
  const rawDeadline = env.ASK_TRACER_DEADLINE_MS;
  if (
    rawDeadline !== undefined &&
    (!/^[0-9]+$/.test(rawDeadline) || Number(rawDeadline) < 100 || Number(rawDeadline) > 10000)
  )
    throw new Error('Invalid AI tracer deadline.');
  const execution = {
    ...(env.ANTHROPIC_API_KEY ? { anthropicApiKey: env.ANTHROPIC_API_KEY } : {}),
    ...(token ? { internalToken: token } : {}),
    ...(apiBaseUrl ? { apiBaseUrl } : {}),
    ...(rawDeadline ? { tracerDeadlineMs: Number(rawDeadline) } : {}),
  };

  if (!rawPort) {
    return { port: DEFAULT_PORT, ...execution };
  }

  const result = portSchema.safeParse(rawPort);
  if (!result.success) {
    throw new Error('AI_PORT must be a valid port number.');
  }

  return { port: result.data, ...execution };
}
