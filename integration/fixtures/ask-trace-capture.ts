import { createServer } from 'node:http';

/** Owned OTLP/HTTP JSON sink; it never forwards payloads outside the fixture network. */
const exports: unknown[] = [];
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/fixture/export') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(exports));
    return;
  }
  if (request.method !== 'POST' || !['/v1/traces', '/v1/metrics'].includes(request.url ?? '')) {
    response.writeHead(404).end();
    return;
  }
  const chunks: Buffer[] = [];
  let length = 0;
  request.on('data', (chunk: Buffer) => {
    length += chunk.length;
    if (length > 4 * 1024 * 1024) request.destroy();
    else chunks.push(chunk);
  });
  request.on('end', () => {
    try {
      if (request.url === '/v1/traces') {
        if (exports.length >= 2000) throw new Error('Capture bound exceeded.');
        exports.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      }
      response.setHeader('content-type', 'application/json');
      response.end('{}');
    } catch {
      response.writeHead(400).end();
    }
  });
});
server.listen(4318, '0.0.0.0');
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => server.close());
