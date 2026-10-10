export interface WorkerShutdownSteps {
  readonly clearReadiness: () => Promise<void>;
  readonly stopCollectionSchedule: () => Promise<void>;
  readonly stopBrokerSupervisor: () => Promise<void>;
  readonly stopRelay: () => Promise<void>;
  readonly stopRetention: () => Promise<void>;
  readonly stopSnapshotRetention?: () => Promise<void>;
  readonly stopHeartbeat: () => void;
  readonly closeBroker: () => Promise<void>;
  readonly closeContext: () => Promise<void>;
  readonly closeTelemetry: () => Promise<void>;
}

export class WorkerShutdownTimeoutError extends Error {
  public constructor() {
    super('Worker shutdown exceeded its configured deadline.');
    this.name = 'WorkerShutdownTimeoutError';
  }
}

async function runOrderedShutdown(steps: WorkerShutdownSteps): Promise<void> {
  await steps.clearReadiness();
  await steps.stopCollectionSchedule();
  await steps.stopBrokerSupervisor();
  await steps.stopRelay();
  await steps.stopRetention();
  await steps.stopSnapshotRetention?.();
  steps.stopHeartbeat();
  await steps.closeBroker();
  await steps.closeContext();
  await steps.closeTelemetry();
}

export async function shutdownWorker(steps: WorkerShutdownSteps, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new WorkerShutdownTimeoutError()), timeoutMs);
  });

  try {
    await Promise.race([runOrderedShutdown(steps), deadline]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
