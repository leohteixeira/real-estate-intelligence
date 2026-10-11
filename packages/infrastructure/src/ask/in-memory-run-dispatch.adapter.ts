import { ExternalFailure, type ExternalFailureKind, type RunDispatch } from '@rei/application';
import type { AskClaim, AskCompletion, AskLiveRun, AskRequestedIdentity } from '@rei/domain';
import {
  parseAskClaim,
  parseAskCompletion,
  parseAskLiveRun,
  sameAskIdentity,
} from '@rei/contracts';
/** Test-only scripted delivery double. Captured requests and replay responses never share objects. */
export class InMemoryRunDispatch implements RunDispatch {
  readonly #claims: AskClaim[];
  readonly #terminal: AskLiveRun;
  readonly #requests: AskRequestedIdentity[] = [];
  readonly #completions: AskCompletion[] = [];
  public constructor(
    claims: readonly AskClaim[],
    terminal: AskLiveRun,
    private readonly failure?: ExternalFailureKind,
  ) {
    this.#claims = claims.map((claim) => structuredClone(parseAskClaim(claim)));
    this.#terminal = structuredClone(parseAskLiveRun(terminal));
  }
  public get requests(): readonly AskRequestedIdentity[] {
    return structuredClone(this.#requests);
  }
  public get completions(): readonly AskCompletion[] {
    return structuredClone(this.#completions);
  }
  private available(signal: AbortSignal, deadlineAt: number): void {
    if (signal.aborted) throw new ExternalFailure({ kind: 'cancelled', operation: 'run-dispatch' });
    if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      throw new ExternalFailure({ kind: 'transient', operation: 'run-dispatch' });
    if (this.failure) throw new ExternalFailure({ kind: this.failure, operation: 'run-dispatch' });
  }
  public async claim(
    identity: AskRequestedIdentity,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<AskClaim> {
    this.available(signal, deadlineAt);
    const response = this.#claims.length > 1 ? this.#claims.shift()! : this.#claims[0];
    if (!response || !sameAskIdentity(identity, response.identity))
      throw new ExternalFailure({ kind: 'rejected', operation: 'run-dispatch' });
    this.#requests.push(structuredClone(identity));
    return structuredClone(response);
  }
  public async complete(
    input: AskCompletion,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<AskLiveRun> {
    this.available(signal, deadlineAt);
    const request = parseAskCompletion(input);
    if (
      request.runId !== this.#terminal.id ||
      request.threadId !== this.#terminal.threadId ||
      (request.evidence !== null && request.evidence.step !== this.#terminal.basis) ||
      this.#terminal.state !== (request.evidence ? 'completed' : 'failed')
    )
      throw new ExternalFailure({ kind: 'rejected', operation: 'run-dispatch' });
    this.#completions.push(structuredClone(request));
    return structuredClone(this.#terminal);
  }
}
