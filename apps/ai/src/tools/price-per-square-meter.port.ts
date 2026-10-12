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
  public constructor(public readonly kind: 'transient' | 'rejected' | 'cancelled' = 'transient') {
    super('Price tool unavailable.');
  }
}
