import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { TelemetryShutdown } from './telemetry-shutdown';

export const TELEMETRY_SHUTDOWN = Symbol('AI_TELEMETRY_SHUTDOWN');

/** Retains diagnostic evidence privately, without exposing SDK messages to ordinary logging. */
export class AiTelemetryShutdownError extends Error {
  readonly #failure: unknown;
  public constructor(failure: unknown) {
    super('AI telemetry shutdown failed.');
    this.name = 'AiTelemetryShutdownError';
    this.#failure = failure;
  }
  public originalFailure(): unknown {
    return this.#failure;
  }
}

@Injectable()
export class AiTelemetryLifecycle implements OnApplicationShutdown {
  readonly #logger = new Logger(AiTelemetryLifecycle.name);
  #completion: Promise<void> | undefined;
  public constructor(@Inject(TELEMETRY_SHUTDOWN) private readonly shutdown: TelemetryShutdown) {}

  public onApplicationShutdown(): Promise<void> {
    this.#completion ??= Promise.resolve()
      .then(() => this.shutdown())
      .catch((failure: unknown) => {
        const error = new AiTelemetryShutdownError(failure);
        this.#logger.error(error.message);
        throw error;
      });
    return this.#completion;
  }
}
