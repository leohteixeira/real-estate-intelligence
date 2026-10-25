/** Read-only authenticated broker availability, without creating business topology. */
export interface BrokerAvailabilityProbe {
  isAvailable(signal: AbortSignal): Promise<boolean>;
}

export const BROKER_AVAILABILITY_PROBE = Symbol.for('rei.BrokerAvailabilityProbe');

/** Controllable fake; deployed composition always uses the infrastructure adapter. */
export class InMemoryBrokerAvailabilityProbe implements BrokerAvailabilityProbe {
  public constructor(public available = true) {}

  public async isAvailable(signal: AbortSignal): Promise<boolean> {
    return !signal.aborted && this.available;
  }
}
