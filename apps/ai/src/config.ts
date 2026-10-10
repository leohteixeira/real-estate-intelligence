import { z } from 'zod';

export interface AiConfig {
  port: number;
}

const DEFAULT_PORT = 4111;
const portSchema = z
  .string()
  .regex(/^\d+$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(65_535));

export function readConfig(env: NodeJS.ProcessEnv): AiConfig {
  const rawPort = env.AI_PORT?.trim();

  if (!rawPort) {
    return { port: DEFAULT_PORT };
  }

  const result = portSchema.safeParse(rawPort);
  if (!result.success) {
    throw new Error(`AI_PORT must be a valid port number, got ${rawPort}.`);
  }

  return { port: result.data };
}
