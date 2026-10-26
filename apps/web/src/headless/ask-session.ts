import {
  parseAskLiveEvent,
  parseRoutedAskAccepted,
  parseRoutedExplainedAskAccepted,
  type AskLiveEvent,
  type RoutedLiveRun,
} from '@rei/contracts';
import { ApiReadError } from '../api/read-error.js';
import type { AdmittedFrame } from '../ask/ask-stream.js';
import { askStreamPolicy } from '../ask/ask-stream.js';
import type { LiveAskAccepted } from './ask-client.js';

export const liveAskSessionPolicy = { maxEvents: 100000 } as const;

// Retained public evidence is compared structurally; JSON member order is immaterial.
function sameEvidence(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null)
    return false;
  const a = Object.entries(left),
    b = Object.entries(right);
  return (
    a.length === b.length &&
    a.every(
      ([key, value]) => Object.hasOwn(right, key) && sameEvidence(value, Reflect.get(right, key)),
    )
  );
}

/** Subscription-owned bounded evidence, initialized from admission rather than a later GET. */
export class LiveAskSession {
  private snapshot: RoutedLiveRun | undefined;
  private sequence = 0;
  private lastSerialized: string | undefined;
  readonly runId: string;
  private readonly threadId: string;
  private readonly basis: LiveAskAccepted['mode'];

  constructor(accepted: LiveAskAccepted) {
    const identity =
      accepted.mode === 'routed-text-explanation-v1'
        ? parseRoutedExplainedAskAccepted(accepted)
        : parseRoutedAskAccepted(accepted);
    this.runId = identity.runId;
    this.threadId = identity.threadId;
    this.basis = identity.mode;
  }

  get run(): RoutedLiveRun | undefined {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }
  get terminal(): boolean {
    return this.snapshot?.terminal != null;
  }
  get cursor(): string | undefined {
    return this.sequence ? `${this.runId}:v1:${this.sequence}` : undefined;
  }

  admit({ frame, serialized }: AdmittedFrame<AskLiveEvent>): boolean {
    try {
      if (new TextEncoder().encode(serialized).byteLength > askStreamPolicy.maxFrameBytes)
        throw new ApiReadError(502);
      parseAskLiveEvent(frame);
      // Keep raw replay evidence tied to the parsed envelope even for direct callers.
      if (!sameEvidence(frame, parseAskLiveEvent(JSON.parse(serialized))))
        throw new ApiReadError(502);
      if (frame.sequence === this.sequence) {
        if (this.lastSerialized !== serialized) throw new ApiReadError(502);
        return false;
      }
      const run = frame.run;
      if (
        this.terminal ||
        frame.sequence !== this.sequence + 1 ||
        frame.sequence > liveAskSessionPolicy.maxEvents ||
        frame.runId !== this.runId ||
        run.threadId !== this.threadId ||
        run.basis !== this.basis
      )
        throw new ApiReadError(502);
      if (run.basis !== 'routed-text-v1' && run.basis !== 'routed-text-explanation-v1')
        throw new ApiReadError(502);
      const old = this.snapshot;
      if (
        old &&
        (run.question !== old.question ||
          run.locale !== old.locale ||
          run.placeId !== old.placeId ||
          run.createdAt !== old.createdAt ||
          run.principalId !== old.principalId ||
          !sameEvidence(run.originalInputs, old.originalInputs) ||
          run.updatedAt < old.updatedAt ||
          old.steps.some((step, index) => !sameEvidence(step, run.steps[index])) ||
          (old.decision !== null && !sameEvidence(old.decision, run.decision)) ||
          (old.confirmation !== null && !sameEvidence(old.confirmation, run.confirmation)) ||
          (old.confirmationDeadline !== null &&
            old.confirmationDeadline !== run.confirmationDeadline))
      )
        throw new ApiReadError(502);
      this.lastSerialized = serialized;
      this.sequence = frame.sequence;
      this.snapshot = structuredClone(run);
      return true;
    } catch {
      throw new ApiReadError(502);
    }
  }
}
