import { describe, expect, it, vi } from 'vitest';
import type { DatabaseConnection } from '../shared/index.js';
import { PostgresPropertyReductionsRepository } from './postgres-property-reductions.repository.js';

describe('owned-schema reduction projection', () => {
  it('makes one parameterized coherent read with safe fields, canonical positions and initial fallback', async () => {
    const query = vi.fn(async () => []);
    const repository = new PostgresPropertyReductionsRepository({
      query,
    } as unknown as DatabaseConnection);
    expect(await repository.readCandidates(['brazil', 'block'])).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0]! as unknown as [string, unknown[]];
    expect(parameters).toEqual([['brazil', 'block']]);
    expect(sql).toContain('=ANY($1::text[])');
    expect(sql).toContain('ORDER BY position DESC LIMIT 1');
    expect(sql).toContain('ORDER BY position)');
    expect(sql).toContain('max(observed_at)');
    expect(sql).toContain("property.resolved_place->'place'");
    expect(sql).not.toMatch(
      /(?:locations|collection|platform)\.|maskedDescription|fingerprint|object_key|SELECT \*|current\.state AS/,
    );
  });
  it('propagates sanitized persistence failures without returning prepared candidates', async () => {
    const connectionUri = (username: string, password: string) =>
      ['postgres:', '', `${username}:${password}@server`, 'db'].join('/');
    const query = vi.fn(async () => {
      throw new Error(`failure ${connectionUri('user', 'secret')}`);
    });
    const repository = new PostgresPropertyReductionsRepository({
      query,
    } as unknown as DatabaseConnection);
    await expect(repository.readCandidates(['block'])).rejects.toThrow(
      connectionUri('redacted', 'redacted'),
    );
  });
});
