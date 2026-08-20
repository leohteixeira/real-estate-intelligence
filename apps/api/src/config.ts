/** Process configuration, read once at start up from the environment. */
export interface ApiConfig {
  readonly port: number;
  readonly databaseUrl: string;
}

const DEFAULT_PORT = 8200;

export function readConfig(env: NodeJS.ProcessEnv): ApiConfig {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required. See env.example.');
  }

  const rawPort = env.API_PORT?.trim();
  const port = rawPort ? Number.parseInt(rawPort, 10) : DEFAULT_PORT;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`API_PORT must be a valid port number, got ${String(rawPort)}.`);
  }

  return { port, databaseUrl };
}
