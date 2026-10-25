import { expect, it } from 'vitest';
import { InMemoryBrokerAvailabilityProbe } from './broker-availability-probe.js';

it('controls broker availability and refuses an aborted request', async () => {
  const probe = new InMemoryBrokerAvailabilityProbe();
  const controller = new AbortController();
  await expect(probe.isAvailable(controller.signal)).resolves.toBe(true);
  probe.available = false;
  await expect(probe.isAvailable(controller.signal)).resolves.toBe(false);
  probe.available = true;
  controller.abort();
  await expect(probe.isAvailable(controller.signal)).resolves.toBe(false);
});
