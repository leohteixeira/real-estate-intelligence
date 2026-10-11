export interface RunExecutorConfig {
  readonly baseUrl: string;
  readonly token: string;
}

export function readRunExecutorConfig(
  environment: NodeJS.ProcessEnv,
): RunExecutorConfig | undefined {
  const token = environment.AI_INTERNAL_TOKEN;
  if (!token) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token) || !environment.AI_URL) throw new Error();
    const url = new URL(environment.AI_URL);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new Error();
    return { baseUrl: url.origin, token };
  } catch {
    throw new TypeError('Invalid RunExecutor configuration.');
  }
}
export function requireRunExecutorConfig(environment: NodeJS.ProcessEnv): RunExecutorConfig {
  const config = readRunExecutorConfig(environment);
  if (!config) throw new Error('RunExecutor is disabled.');
  return config;
}
