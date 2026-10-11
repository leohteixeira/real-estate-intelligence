import {
  parsePriceToolReceipt,
  sameAskIdentity,
  sameAskInputs,
  type PriceToolReceipt,
  type PriceToolRequest,
} from '@rei/contracts';
import { PriceToolFailure, type PricePerSquareMeterTool } from './price-per-square-meter.port';
/** Test-only receipt replay; no arithmetic and never registered in production ToolsModule. */
export class InMemoryPricePerSquareMeterTool implements PricePerSquareMeterTool {
  readonly #receipt: PriceToolReceipt;
  readonly #requests: PriceToolRequest[] = [];
  public constructor(
    receipt: PriceToolReceipt,
    private readonly fail = false,
  ) {
    this.#receipt = structuredClone(parsePriceToolReceipt(receipt));
  }
  public get requests(): readonly PriceToolRequest[] {
    return structuredClone(this.#requests);
  }
  public async calculate(
    request: PriceToolRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<PriceToolReceipt> {
    if (
      this.fail ||
      signal.aborted ||
      !Number.isFinite(deadlineAt) ||
      deadlineAt <= Date.now() ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(grant) ||
      !sameAskIdentity(request, this.#receipt) ||
      request.executionId !== this.#receipt.executionId ||
      request.operation !== this.#receipt.operation ||
      !sameAskInputs(request.inputs, this.#receipt.inputs)
    )
      throw new PriceToolFailure();
    this.#requests.push(structuredClone(request));
    return structuredClone(this.#receipt);
  }
}
