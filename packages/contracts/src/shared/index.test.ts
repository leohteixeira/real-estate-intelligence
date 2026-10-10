import { describe, expect, it } from 'vitest';

import { API_PREFIX, API_VERSION } from '../index.js';

describe('shared contract root exports', () => {
  it('keeps the version constants available from the package root', () => {
    expect(API_VERSION).toBe('v1');
    expect(API_PREFIX).toBe('api/v1');
  });
});
