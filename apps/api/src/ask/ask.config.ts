export function readAskConfig(env: NodeJS.ProcessEnv): { readonly secret?: string } {
  const secret = env.ASK_DISPATCH_SECRET;
  if (!secret) return {};
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(secret))
    throw new Error('Invalid Ask dispatch configuration.');
  return { secret };
}
