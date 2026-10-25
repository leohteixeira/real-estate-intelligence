export type AccessibilityCheckpoint = (name: string, work: () => Promise<void>) => Promise<void>;

function signal<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type Outcome = { error?: unknown };
interface Step {
  name: string;
  begin: ReturnType<typeof signal<Outcome>>;
  completed: ReturnType<typeof signal<Outcome>>;
  resume: ReturnType<typeof signal<Outcome>>;
}
type Boundary = { step: Step } | { outcome: Outcome };

/** Keep one owned fixture, while each declared state runs inside its own native test budget. */
export function accessibilitySteps() {
  let boundary = signal<Boundary>();
  let active: Step | undefined;
  let execution: Promise<Outcome> | undefined;

  const checkpoint: AccessibilityCheckpoint = async (name, work) => {
    const step: Step = {
      name,
      begin: signal<Outcome>(),
      completed: signal<Outcome>(),
      resume: signal<Outcome>(),
    };
    boundary.resolve({ step });
    const permission = await step.begin.promise;
    if ('error' in permission) throw permission.error;
    try {
      await work();
      step.completed.resolve({});
    } catch (error) {
      step.completed.resolve({ error });
      throw error;
    }
    const continuation = await step.resume.promise;
    if ('error' in continuation) throw continuation.error;
  };

  function requireSuccess(outcome: Outcome): void {
    if ('error' in outcome) throw outcome.error;
  }

  return {
    async start(work: (checkpoint: AccessibilityCheckpoint) => Promise<void>) {
      if (execution) throw new Error('Accessibility execution already started');
      execution = work(checkpoint).then(
        () => ({}),
        (error: unknown) => ({ error }),
      );
      void execution.then((outcome) => boundary.resolve({ outcome }));
      const first = await boundary.promise;
      if ('outcome' in first) {
        requireSuccess(first.outcome);
        throw new Error('Accessibility execution produced no declared state');
      }
    },
    async advance(name: string) {
      if (!execution) throw new Error('Accessibility execution has not started');
      active?.resume.resolve({});
      const next = await boundary.promise;
      if ('outcome' in next) {
        requireSuccess(next.outcome);
        throw new Error(`Missing declared accessibility state: ${name}`);
      }
      boundary = signal<Boundary>();
      active = next.step;
      if (active.name !== name) {
        const error = new Error(`Expected accessibility state ${name}, received ${active.name}`);
        active.begin.resolve({ error });
        await execution;
        throw error;
      }
      active.begin.resolve({});
      requireSuccess(await active.completed.promise);
    },
    async finish() {
      if (!execution) return;
      active?.resume.resolve({});
      const next = await boundary.promise;
      if ('step' in next) {
        next.step.begin.resolve({
          error: new Error(`Unexecuted accessibility state: ${next.step.name}`),
        });
      }
      requireSuccess(await execution);
    },
  };
}
