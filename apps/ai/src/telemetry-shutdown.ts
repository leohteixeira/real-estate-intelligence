export type TelemetryShutdown = () => Promise<void>;

let shutdown: TelemetryShutdown | undefined;
const noTelemetry: TelemetryShutdown = async () => {};

/** The preload registers its SDK callback; importing this bridge never initializes an SDK. */
export function registerTelemetryShutdown(callback: TelemetryShutdown): void {
  shutdown = callback;
}

export function telemetryShutdownCallback(): TelemetryShutdown {
  return shutdown ?? noTelemetry;
}
