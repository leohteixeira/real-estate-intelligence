import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

describe('readConfig', () => {
  it('validates a fixed API origin and configurable tracer budget bounded by worker execution', () => {
    expect(
      readConfig({ API_BASE_URL: 'http://api.internal:8200', ASK_TRACER_DEADLINE_MS: '4500' }),
    ).toEqual({ port: 4111, apiBaseUrl: 'http://api.internal:8200', tracerDeadlineMs: 4500 });
    expect(readConfig({ ASK_TRACER_DEADLINE_MS: '20000' })).toEqual({
      port: 4111,
      tracerDeadlineMs: 20000,
    });
    for (const API_BASE_URL of [
      'file:///tmp/tool',
      'https://user:secret@api.internal',
      'https://api.internal/path',
      'https://api.internal/?target=evil',
      'invalid',
    ])
      expect(() => readConfig({ API_BASE_URL })).toThrow('Invalid AI tool configuration.');
    for (const ASK_TRACER_DEADLINE_MS of ['99', '20001', '-1', 'Infinity', '', '4500x'])
      expect(() => readConfig({ ASK_TRACER_DEADLINE_MS })).toThrow('Invalid AI tracer deadline.');
  });
  it('uses port 4111 when AI_PORT is absent', () => {
    expect(readConfig({})).toEqual({ port: 4111 });
  });

  it('accepts a valid port', () => {
    expect(readConfig({ AI_PORT: '5000' })).toEqual({ port: 5000 });
  });

  it.each(['0', '65536', '4111rest', 'http'])('rejects an invalid AI_PORT value: %s', (value) => {
    expect(() => readConfig({ AI_PORT: value })).toThrow('AI_PORT must be a valid port number.');
  });
  it('reads the Anthropic credential only from ANTHROPIC_API_KEY and ignores the removed gateway key', () => {
    expect(readConfig({ ANTHROPIC_API_KEY: 'offline-fixture' })).toEqual({
      port: 4111,
      anthropicApiKey: 'offline-fixture',
    });
    expect(readConfig({ ANTHROPIC_API_KEY: '', AI_GATEWAY_API_KEY: 'removed' })).toEqual({
      port: 4111,
    });
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
