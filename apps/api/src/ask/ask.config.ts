import { validatedAskDemoQuotaPolicy, type AskDemoQuotaPolicy } from '@rei/application';

export interface AskConfig {
  readonly secret?: string;
  readonly quotas: AskDemoQuotaPolicy;
  readonly production: boolean;
}
export function readAskConfig(env: NodeJS.ProcessEnv): AskConfig {
  const secret = env.ASK_DISPATCH_SECRET;
  if (secret && !/^[A-Za-z0-9_-]{43,128}$/.test(secret))
    throw new Error('Invalid Ask dispatch configuration.');
  const limit = (name: string, fallback: number): number => {
    const value = env[name];
    if (value === undefined) return fallback;
    if (!/^[1-9][0-9]*$/.test(value)) throw new Error('Invalid Ask quota configuration.');
    return Number(value);
  };
  const quotas = validatedAskDemoQuotaPolicy({
    visitorDailyLimit: limit('ASK_VISITOR_DAILY_LIMIT', 20),
    globalDailyLimit: limit('ASK_GLOBAL_DAILY_LIMIT', 100),
  });
  return { ...(secret ? { secret } : {}), quotas, production: env.NODE_ENV === 'production' };
}
