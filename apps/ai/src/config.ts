import { z } from 'zod';

export interface AiConfig {
  port: number;
  internalToken?: string;
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
  const execution = token ? { internalToken: token } : {};

  if (!rawPort) {
    return { port: DEFAULT_PORT, ...execution };
  }

  const result = portSchema.safeParse(rawPort);
  if (!result.success) {
    throw new Error('AI_PORT must be a valid port number.');
  }

  return { port: result.data, ...execution };
}
