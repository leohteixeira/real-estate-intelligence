import type { AskRun } from '@rei/contracts';
import { ApiReadError } from '../api/client';
import type { AdmittedFrame } from './ask-stream';
import { sameIdentity, sameStep, sameDecision, sameConfirmation } from './ask-equality';

/** Bounded, subscription-owned evidence. Fixed ordinary GETs never replace a stream snapshot. */
export class AskSession {
  private snapshot: AskRun;
  private sequence = 0;
  private readonly accepted = new Map<string, string>();
  private readonly immutable: AskRun;

  constructor(run: AskRun) {
    this.snapshot = run;
    this.immutable = run;
  }
  get run(): AskRun {
    return this.snapshot;
  }
  get terminal(): boolean {
    return this.snapshot.terminal !== null;
  }
  get cursor(): string | undefined {
    return this.sequence ? `${this.snapshot.id}:v1:${this.sequence}` : undefined;
  }

  admit({ frame, serialized }: AdmittedFrame): boolean {
    const previous = this.accepted.get(frame.id);
    if (previous !== undefined) {
      if (previous !== serialized) throw new ApiReadError(502);
      return false;
    }
    if (
      (this.sequence > 0 && this.terminal) ||
      frame.sequence !== this.sequence + 1 ||
      frame.sequence > 100 ||
      frame.runId !== this.snapshot.id ||
      frame.id !== `${this.snapshot.id}:v1:${frame.sequence}` ||
      !sameIdentity(frame.run, this.immutable) ||
      frame.run.updatedAt < this.snapshot.updatedAt ||
      (this.snapshot.state !== 'queued' && frame.run.state === 'queued') ||
      this.snapshot.steps.some((step, index) => !sameStep(step, frame.run.steps[index])) ||
      (this.snapshot.decision !== null &&
        !sameDecision(this.snapshot.decision, frame.run.decision)) ||
      (this.snapshot.confirmation !== null &&
        !sameConfirmation(this.snapshot.confirmation, frame.run.confirmation))
    )
      throw new ApiReadError(502);
    this.accepted.set(frame.id, serialized);
    this.sequence = frame.sequence;
    this.snapshot = frame.run;
    return true;
  }
}
