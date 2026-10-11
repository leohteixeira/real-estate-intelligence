import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

describe('readConfig', () => {
  it('uses port 4111 when AI_PORT is absent', () => {
    expect(readConfig({})).toEqual({ port: 4111 });
  });

  it('accepts a valid port', () => {
    expect(readConfig({ AI_PORT: '5000' })).toEqual({ port: 5000 });
  });

  it.each(['0', '65536', '4111rest', 'http'])('rejects an invalid AI_PORT value: %s', (value) => {
    expect(() => readConfig({ AI_PORT: value })).toThrow('AI_PORT must be a valid port number.');
  });
  it('keeps execution disabled when token is absent or empty and accepts strict authority', () => {
    expect(readConfig({ AI_INTERNAL_TOKEN: '' })).toEqual({ port: 4111 });
    expect(readConfig({ AI_INTERNAL_TOKEN: 'a'.repeat(48) }).internalToken).toBe('a'.repeat(48));
  });
  it.each(['short', ' '.repeat(48), 'secret\nvalue', 'x'.repeat(129), `${'a'.repeat(48)}\n`])(
    'rejects malformed token without reflection',
    (token) => {
      expect(() => readConfig({ AI_INTERNAL_TOKEN: token })).toThrow(
        'Invalid AI execution configuration.',
      );
    },
  );
});
