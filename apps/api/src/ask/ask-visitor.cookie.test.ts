import { createHmac } from 'node:crypto';
import type { Response, CookieOptions } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { askVisitorAdmission } from './ask-visitor.cookie';
import { readAskConfig } from './ask.config';

const secret = 's'.repeat(43),
  now = Date.parse('2026-10-26T12:00:00Z');
function issued(production = false) {
  const cookie = vi.fn<(name: string, value: unknown, options?: CookieOptions) => Response>();
  const config = readAskConfig({
    ASK_DISPATCH_SECRET: secret,
    NODE_ENV: production ? 'production' : 'test',
  });
  const admission = askVisitorAdmission({ headers: {} }, { cookie }, config, now);
  const call = cookie.mock.calls[0]!;
  return { cookie, config, admission, name: call[0], value: call[1] as string, options: call[2] };
}
describe('authenticated Ask visitor identity', () => {
  it.each([false, true])(
    'issues opaque, expiring and explicitly scoped production=%s cookies',
    (production) => {
      const result = issued(production);
      expect(result.name).toBe(production ? '__Secure-rei_ask_visitor' : 'rei_ask_visitor');
      expect(result.options).toEqual({
        httpOnly: true,
        sameSite: 'strict',
        secure: production,
        path: production ? '/real-estate-intelligence/' : '/',
        maxAge: 2592000000,
        expires: new Date(now + 2592000000),
      });
      expect(result.value).toMatch(
        /^v1\.[A-Za-z0-9_-]{43}\.[0-9]{10}\.[0-9]{10}\.[A-Za-z0-9_-]{43}$/,
      );
      expect(result.admission).toEqual({ visitorDigest: expect.stringMatching(/^[0-9a-f]{64}$/) });
      expect(JSON.stringify(result.admission)).not.toContain(result.value.split('.')[1]);
      expect(JSON.stringify(result.admission)).not.toContain(secret);
      const cookie = vi.fn<(name: string, value: unknown, options?: CookieOptions) => Response>();
      expect(
        askVisitorAdmission(
          { headers: { cookie: `unrelated=x; ${result.name}=${result.value}` } },
          { cookie },
          result.config,
          now + 1000,
        ),
      ).toEqual(result.admission);
      expect(cookie).not.toHaveBeenCalled();
      expect(issued(production).admission).not.toEqual(result.admission);
    },
  );
  it('renews malformed, tampered, duplicate, expired, future and wrong-purpose cookies', () => {
    const { name, value, config, admission } = issued();
    const pieces = value.split('.');
    const payload = pieces.slice(0, -1).join('.');
    const wrongPurpose = `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
    const cases = [
      ['', now],
      ['broken', now],
      [value.replace(pieces[1]!, 'a'.repeat(43)), now],
      [value.slice(0, -1) + (value.endsWith('a') ? 'b' : 'a'), now],
      [wrongPurpose, now],
      [value, now - 1000],
      [value, now + 2592000000],
    ] as const;
    for (const [candidate, time] of cases) {
      const cookie = vi.fn<(name: string, value: unknown, options?: CookieOptions) => Response>();
      expect(
        askVisitorAdmission(
          { headers: { cookie: `${name}=${candidate}` } },
          { cookie },
          config,
          time,
        ),
      ).not.toEqual(admission);
      expect(cookie).toHaveBeenCalledOnce();
    }
    const cookie = vi.fn<(name: string, value: unknown, options?: CookieOptions) => Response>();
    expect(
      askVisitorAdmission(
        { headers: { cookie: `${name}=${value}; ${name}=${value}` } },
        { cookie },
        config,
        now,
      ),
    ).not.toEqual(admission);
    expect(cookie).toHaveBeenCalledOnce();
    // Proxy metadata never changes the explicitly configured local scope.
    askVisitorAdmission(
      { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-prefix': '/other' } },
      { cookie },
      config,
      now,
    );
    expect(cookie.mock.calls.at(-1)?.[2]).toMatchObject({ secure: false, path: '/' });
  });
  it('requires protected signing and never accepts local identities in production', () => {
    expect(() => askVisitorAdmission({ headers: {} }, undefined, readAskConfig({}), now)).toThrow(
      'signing unavailable',
    );
    const local = issued();
    const production = readAskConfig({ ASK_DISPATCH_SECRET: secret, NODE_ENV: 'production' });
    const cookie = vi.fn<(name: string, value: unknown, options?: CookieOptions) => Response>();
    expect(
      askVisitorAdmission(
        { headers: { cookie: `${local.name}=${local.value}` } },
        { cookie },
        production,
        now,
      ),
    ).not.toEqual(local.admission);
    expect(cookie).toHaveBeenCalledOnce();
  });
});
