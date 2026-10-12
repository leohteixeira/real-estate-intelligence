import { describe, expect, it, vi } from 'vitest';
import { HttpModelExplanationAdapter } from './http-model-explanation.adapter';
import { modelReceipt as receipt } from './model-test.fixture';
const request = {
  version: 1 as const,
  eventId: receipt.eventId,
  runId: receipt.runId,
  threadId: receipt.threadId,
  executionId: receipt.executionId,
  operation: 'get' as const,
};
const signal = () => new AbortController().signal;
describe('bounded scoped model receipt HTTP adapter', () => {
  it('uses fixed API destination, no redirects and strong dedicated grant', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ operation: 'get', explanation: null }));
    expect(
      await new HttpModelExplanationAdapter('http://api:8200', transport).execute(
        request,
        'g'.repeat(43),
        signal(),
        Date.now() + 1000,
      ),
    ).toEqual({ operation: 'get', explanation: null });
    expect(transport.mock.lastCall?.[0]).toBe(
      `http://api:8200/api/v1/internal/ask/runs/${receipt.runId}/model-explanation`,
    );
    expect(transport.mock.lastCall?.[1]).toMatchObject({
      redirect: 'manual',
      method: 'POST',
      headers: { authorization: `Bearer ${'g'.repeat(43)}` },
    });
  });
  it.each([
    'http://user:pass@api:8200',
    'http://api:8200/other',
    'http://api:8200?secret=1',
    'ftp://api:8200',
    'http://api:8200/#x',
  ])('refuses arbitrary authority/destination %s', (origin) =>
    expect(() => new HttpModelExplanationAdapter(origin)).toThrow(),
  );
  it.each([400, 401, 403, 409, 429, 500, 503])(
    'sanitizes HTTP %s without response echo',
    async (status) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('secret', { status }));
      await expect(
        new HttpModelExplanationAdapter('http://api:8200', transport).execute(
          request,
          'g'.repeat(43),
          signal(),
          Date.now() + 1000,
        ),
      ).rejects.toMatchObject({
        kind: status >= 500 ? 'transient' : 'rejected',
        message: 'Model explanation unavailable.',
      });
    },
  );
  it('classifies budget refusal and invalid request/grant without a provider attempt', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 400 }));
    await expect(
      new HttpModelExplanationAdapter('http://api:8200', transport).execute(
        {
          ...request,
          operation: 'reserve',
          purpose: 'explanation',
          model: 'anthropic/claude-haiku-5.5',
          route: 'vercel-ai-gateway',
          maxOutputTokens: 1000,
          attemptKey: 'a'.repeat(32),
        },
        'g'.repeat(43),
        signal(),
        Date.now() + 1000,
      ),
    ).rejects.toMatchObject({ kind: 'budget' });
    transport.mockClear();
    await expect(
      new HttpModelExplanationAdapter('http://api:8200', transport).execute(
        request,
        'short',
        signal(),
        Date.now() + 1000,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    new Response(null),
    new Response('invalid', { headers: { 'content-type': 'application/json' } }),
    Response.json({ operation: 'get', explanation: null, extra: true }),
    new Response('x'.repeat(17000), { headers: { 'content-type': 'application/json' } }),
    new Response('{}', {
      headers: { 'content-type': 'application/json', 'content-length': '17000' },
    }),
  ])('rejects malformed/bounded payloads', async (response) => {
    await expect(
      new HttpModelExplanationAdapter(
        'http://api:8200',
        vi.fn<typeof fetch>().mockResolvedValue(response),
      ).execute(request, 'g'.repeat(43), signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
  it('propagates pre-cancellation, deadline, in-flight abort and sanitized transport failure', async () => {
    const controller = new AbortController();
    controller.abort();
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('secret socket message'));
    const adapter = new HttpModelExplanationAdapter('http://api:8200', transport);
    await expect(
      adapter.execute(request, 'g'.repeat(43), controller.signal, Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(
      adapter.execute(request, 'g'.repeat(43), signal(), Date.now() - 1),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(transport).not.toHaveBeenCalled();
    await expect(
      adapter.execute(request, 'g'.repeat(43), signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'transient' });
    const during = new AbortController();
    transport.mockImplementation(async () => {
      during.abort();
      throw new Error('aborted');
    });
    await expect(
      adapter.execute(request, 'g'.repeat(43), during.signal, Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
