import { createRequire, syncBuiltinESMExports } from 'node:module';
import { context, SpanKind, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { expect, it } from 'vitest';

it('exports parent and ordinary HTTP spans without exporting transient photograph URLs', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new NodeTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  provider.register();
  // Install the same outgoing instrumentation as the worker preload before loading the adapter.
  // This fixture's server is outside the production acquisition boundary being tested.
  const instrumentation = new HttpInstrumentation({ ignoreIncomingRequestHook: () => true });
  instrumentation.setTracerProvider(provider);
  const http: typeof import('node:http') = createRequire(import.meta.url)('node:http');
  syncBuiltinESMExports();
  const requests: string[] = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url!);
    response.writeHead(request.url?.includes('failure') ? 503 : 200, {
      'content-type': 'image/png',
    });
    response.end(Buffer.from([1, 2, 3]));
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected fixture TCP address.');
    const origin = `http://127.0.0.1:${address.port}`;
    const photoPath = '/private-photograph-sentinel.png?signature=transient-secret';
    const failurePath = '/private-photograph-failure.png?signature=transient-secret';
    const ordinaryUrls = [origin + '/ordinary-before', origin + '/ordinary-after'];
    const { HttpListingPhoto } = await import('./http-listing-photo.js');
    const tracer = trace.getTracer('rei.test.collection');
    const ordinaryRequest = async (url: string) =>
      new Promise<void>((resolve, reject) => {
        const request = http.request(url, (response) => {
          response.resume();
          response.once('end', resolve);
          response.once('error', reject);
        });
        request.once('error', reject);
        request.end();
      });
    await tracer.startActiveSpan('collection', async (parent) => {
      try {
        const client = new HttpListingPhoto([origin], {
          compute: async () => {
            expect(trace.getActiveSpan()?.spanContext().spanId).toBe(parent.spanContext().spanId);
            expect(isTracingSuppressed(context.active())).toBe(false);
            return 'dhash64-v1:0123456789abcdef';
          },
        });
        await ordinaryRequest(ordinaryUrls[0]!);
        await expect(
          client.fingerprintPhoto('fixture', origin + photoPath, AbortSignal.timeout(2_000)),
        ).resolves.toBe('dhash64-v1:0123456789abcdef');
        await expect(
          client.fingerprintPhoto('fixture', origin + failurePath, AbortSignal.timeout(2_000)),
        ).rejects.toMatchObject({ kind: 'transient' });
        expect(trace.getActiveSpan()?.spanContext().spanId).toBe(parent.spanContext().spanId);
        expect(isTracingSuppressed(context.active())).toBe(false);
        await ordinaryRequest(ordinaryUrls[1]!);
      } finally {
        parent.end();
      }
    });
    await provider.forceFlush();
    expect(requests).toEqual(['/ordinary-before', photoPath, failurePath, '/ordinary-after']);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(3);
    const parent = spans.find(({ name }) => name === 'collection')!;
    const outgoing = spans.filter(({ kind }) => kind === SpanKind.CLIENT);
    expect(outgoing.map(({ attributes }) => attributes['url.full'])).toEqual(ordinaryUrls);
    for (const span of outgoing) {
      expect(span.parentSpanContext?.spanId).toBe(parent.spanContext().spanId);
      expect(span.spanContext().traceId).toBe(parent.spanContext().traceId);
    }
    const exported = JSON.stringify(
      spans.map(({ name, attributes, events, status, resource }) => ({
        name,
        attributes,
        events,
        status,
        resource: resource.attributes,
      })),
    );
    expect(exported).not.toContain('private-photograph');
    expect(exported).not.toContain('transient-secret');
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    instrumentation.disable();
    syncBuiltinESMExports();
    await provider.shutdown();
    trace.disable();
    context.disable();
  }
});
