import { describe, expect, it, vi } from 'vitest';
import { RabbitMqAvailabilityProbe } from './rabbitmq-availability-probe.js';

const URL = 'amqp://fixture:secret@broker/fixture-vhost';
function connection() {
  return { on: vi.fn(), close: vi.fn(async () => {}) };
}

describe('RabbitMqAvailabilityProbe', () => {
  it('authenticates once and closes without opening any channel', async () => {
    const client = connection();
    const connect = vi.fn(async () => client);
    const signal = new AbortController().signal;
    await expect(new RabbitMqAvailabilityProbe(URL, connect).isAvailable(signal)).resolves.toBe(
      true,
    );
    expect(connect).toHaveBeenCalledExactlyOnceWith(URL, { signal, timeout: 2000 });
    expect(client.close).toHaveBeenCalledOnce();
    expect(client.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('does not attempt an already cancelled handshake', async () => {
    const connect = vi.fn();
    await expect(
      new RabbitMqAvailabilityProbe(URL, connect).isAvailable(AbortSignal.abort()),
    ).resolves.toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each(['authentication refused', 'amqp://fixture:secret@broker/fixture-vhost'])(
    'returns only false on connection failure (%s)',
    async (failure) => {
      const connect = vi.fn(async () => {
        throw new Error(failure);
      });
      await expect(
        new RabbitMqAvailabilityProbe(URL, connect).isAvailable(new AbortController().signal),
      ).resolves.toBe(false);
      expect(connect).toHaveBeenCalledOnce();
    },
  );

  it('returns false on close failure', async () => {
    const client = connection();
    client.close.mockRejectedValue(new Error('connection lost'));
    await expect(
      new RabbitMqAvailabilityProbe(URL, async () => client).isAvailable(
        new AbortController().signal,
      ),
    ).resolves.toBe(false);
    expect(client.close).toHaveBeenCalledOnce();
  });

  it('bounds a pending handshake and closes a late connection', async () => {
    let deliver!: (client: ReturnType<typeof connection>) => void;
    const connect = vi.fn(
      () =>
        new Promise<ReturnType<typeof connection>>((resolve) => {
          deliver = resolve;
        }),
    );
    const controller = new AbortController();
    const pending = new RabbitMqAvailabilityProbe(URL, connect).isAvailable(controller.signal);
    controller.abort();
    await expect(pending).resolves.toBe(false);
    const client = connection();
    deliver(client);
    await vi.waitFor(() => expect(client.close).toHaveBeenCalledOnce());
    expect(connect).toHaveBeenCalledOnce();
  });

  it('bounds a stalled close through the same socket cancellation signal', async () => {
    const controller = new AbortController();
    const client = connection();
    client.close.mockImplementation(() => new Promise(() => {}));
    const pending = new RabbitMqAvailabilityProbe(URL, async () => client).isAvailable(
      controller.signal,
    );
    await vi.waitFor(() => expect(client.close).toHaveBeenCalledOnce());
    controller.abort();
    await expect(pending).resolves.toBe(false);
  });
});
