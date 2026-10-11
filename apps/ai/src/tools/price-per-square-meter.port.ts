import type { PriceToolReceipt, PriceToolRequest } from '@rei/contracts';
export const PRICE_TOOL = Symbol('PRICE_TOOL');
export interface PricePerSquareMeterTool {
  calculate(
    request: PriceToolRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<PriceToolReceipt>;
}
export class PriceToolFailure extends Error {
  public constructor() {
    super('Price tool unavailable.');
  }
}
