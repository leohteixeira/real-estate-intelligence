import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  shutdownWorker,
  type WorkerShutdownSteps,
  WorkerShutdownTimeoutError,
} from './worker-shutdown';

function shutdownSteps(overrides: Partial<WorkerShutdownSteps> = {}): WorkerShutdownSteps {
  return {
    clearReadiness: vi.fn().mockResolvedValue(undefined),
    stopBrokerSupervisor: vi.fn().mockResolvedValue(undefined),
    stopRelay: vi.fn().mockResolvedValue(undefined),
    stopRetention: vi.fn().mockResolvedValue(undefined),
    stopHeartbeat: vi.fn(),
    closeBroker: vi.fn().mockResolvedValue(undefined),
    closeContext: vi.fn().mockResolvedValue(undefined),
    closeTelemetry: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('shutdownWorker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs the complete shutdown in order within one deadline', async () => {
    const calls: string[] = [];
    const step = (name: string) => async (): Promise<void> => {
      calls.push(name);
    };
    const steps = shutdownSteps({
      clearReadiness: step('readiness'),
      stopBrokerSupervisor: step('supervisor'),
      stopRelay: step('relay'),
      stopRetention: step('retention'),
      stopHeartbeat: () => calls.push('heartbeat'),
      closeBroker: step('broker'),
      closeContext: step('context'),
      closeTelemetry: step('telemetry'),
    });

    await shutdownWorker(steps, 1_000);

    expect(calls).toEqual([
      'readiness',
      'supervisor',
      'relay',
      'retention',
      'heartbeat',
      'broker',
      'context',
      'telemetry',
    ]);
  });

  it('rejects when the overall shutdown deadline expires', async () => {
    vi.useFakeTimers();
    const steps = shutdownSteps({ stopRelay: () => new Promise(() => undefined) });
    const shutdown = shutdownWorker(steps, 1_000);
    const result = expect(shutdown).rejects.toBeInstanceOf(WorkerShutdownTimeoutError);

    await vi.advanceTimersByTimeAsync(1_000);

    await result;
    expect(steps.clearReadiness).toHaveBeenCalledOnce();
    expect(steps.closeBroker).not.toHaveBeenCalled();
  });

  it('propagates shutdown failures for the signal handler to terminate the process', async () => {
    const failure = new Error('close failed');
    const steps = shutdownSteps({ closeBroker: vi.fn().mockRejectedValue(failure) });

    await expect(shutdownWorker(steps, 1_000)).rejects.toBe(failure);
    expect(steps.closeContext).not.toHaveBeenCalled();
  });
});
