import nock from 'nock';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { expect, test } from 'vitest';
import { requestHttp } from './http.ts';
import { allowOwnedEndpoint, finishNetwork, guardNetwork } from './network.ts';

function port(server: Server) {
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Owned HTTP fixture has no TCP address.');
  return address.port;
}

test('Supertest preserves malformed queries, non-2xx payloads, bodyless POST and correlation headers', async () => {
  const observed: {
    method: string | undefined;
    url: string | undefined;
    length: string | undefined;
  }[] = [];
  const server = createServer((request, response) => {
    observed.push({
      method: request.method,
      url: request.url,
      length: request.headers['content-length'],
    });
    response.writeHead(400, {
      'content-type': 'application/json',
      'x-request-id': 'owned-response',
    });
    response.end(JSON.stringify({ error: { code: 'bad_request' } }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${port(server)}`;
    allowOwnedEndpoint(base);
    const response = await requestHttp(`${base}/api/v1/places/with%20space?x[y]=1&x=1&x=2`, {
      method: 'POST',
      headers: { traceparent: 'controlled-fixture' },
    });
    expect(response.status).toBe(400);
    expect(response.ok).toBe(false);
    expect(await response.json()).toEqual({ error: { code: 'bad_request' } });
    expect(response.headers.get('x-request-id')).toBe('owned-response');
    expect(observed).toEqual([
      { method: 'POST', url: '/api/v1/places/with%20space?x[y]=1&x=1&x=2', length: '0' },
    ]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Nock consumes exact synthetic external scopes and refuses unmocked outside hosts', async () => {
  const scope = nock('https://synthetic-dependency.invalid')
    .get('/controlled')
    .reply(200, { synthetic: true });
  expect(
    await (await requestHttp('https://synthetic-dependency.invalid/controlled')).json(),
  ).toEqual({ synthetic: true });
  expect(scope.isDone()).toBe(true);
  await expect(requestHttp('https://unowned-outside.invalid/refused')).rejects.toThrow(
    /Disallowed net connect/,
  );
});

test('unfinished mocks fail teardown and are removed before the next test', () => {
  nock('https://synthetic-dependency.invalid').get('/unconsumed').reply(200);
  expect(finishNetwork).toThrow(/Unconsumed external HTTP mocks/);
  expect(nock.pendingMocks()).toEqual([]);
  guardNetwork();
});

test('Supertest honours AbortSignal cancellation and rejects invalid endpoint syntax', async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${port(server)}`;
    allowOwnedEndpoint(base);
    await expect(
      requestHttp(`${base}/pending`, { signal: AbortSignal.timeout(30) }),
    ).rejects.toThrow();
    await expect(requestHttp('/relative')).rejects.toThrow(/absolute HTTP URL/);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
