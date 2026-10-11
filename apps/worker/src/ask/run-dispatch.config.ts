import type { HttpRunDispatchConfig } from '@rei/infrastructure';
export function readRunDispatchConfig(env: NodeJS.ProcessEnv): HttpRunDispatchConfig | undefined {
  if (!env.ASK_DISPATCH_SECRET) return undefined;
  try {
    const url = new URL(env.API_BASE_URL ?? '');
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(env.ASK_DISPATCH_SECRET)
    )
      throw new Error();
    return { baseUrl: url.origin, secret: env.ASK_DISPATCH_SECRET };
  } catch {
    throw new Error('Invalid Ask dispatch configuration.');
  }
}
