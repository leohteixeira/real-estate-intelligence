import { expect, it } from 'vitest';
import { readAskConfig } from './ask.config';
it('validates positive safe quotas and preserves protected operational secret validation', () => {
  expect(readAskConfig({})).toEqual({
    quotas: { visitorDailyLimit: 20, globalDailyLimit: 100 },
    production: false,
  });
  expect(
    readAskConfig({
      ASK_DISPATCH_SECRET: 's'.repeat(43),
      NODE_ENV: 'production',
      ASK_VISITOR_DAILY_LIMIT: '2',
      ASK_GLOBAL_DAILY_LIMIT: '3',
    }),
  ).toEqual({
    secret: 's'.repeat(43),
    production: true,
    quotas: { visitorDailyLimit: 2, globalDailyLimit: 3 },
  });
  for (const key of ['ASK_VISITOR_DAILY_LIMIT', 'ASK_GLOBAL_DAILY_LIMIT'])
    for (const value of ['', '0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992', ' 2', '02'])
      expect(() => readAskConfig({ [key]: value })).toThrow('quota configuration');
  expect(() => readAskConfig({ ASK_DISPATCH_SECRET: 'invalid' })).toThrow('dispatch configuration');
});
