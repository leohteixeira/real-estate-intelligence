import type { BrokerAvailabilityProbe } from '@rei/application';
import amqp from 'amqplib';

interface ProbeConnection {
  on(event: 'error', listener: (error: Error) => void): unknown;
  close(): Promise<void>;
}

type ProbeConnector = (
  url: string,
  options: { signal: AbortSignal; timeout: number },
) => Promise<ProbeConnection>;

/** A single authenticated AMQP handshake. No channels, queues or exchanges are created. */
export class RabbitMqAvailabilityProbe implements BrokerAvailabilityProbe {
  public constructor(
    private readonly url: string,
    private readonly connect: ProbeConnector = (url, options) => amqp.connect(url, options),
  ) {}

  public async isAvailable(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return false;
    let onAbort = (): void => {};
    const aborted = new Promise<false>((resolve) => {
      onAbort = () => resolve(false);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    // amqplib forwards socket options to Node's net/tls connector: the signal destroys both
    // a pending handshake and an established socket, including an unresponsive close handshake.
    const attempt = (async (): Promise<boolean> => {
      try {
        const connection = await this.connect(this.url, { signal, timeout: 2_000 });
        connection.on('error', () => {});
        await connection.close();
        return !signal.aborted;
      } catch {
        // Driver errors may contain credentials or vhost details. Only availability escapes.
        return false;
      }
    })();
    try {
      return await Promise.race([attempt, aborted]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  }
}
