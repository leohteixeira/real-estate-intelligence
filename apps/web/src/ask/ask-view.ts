import { parseAskInputs, type AskInputs, type AskRun, type RoutedLiveRun } from '@rei/contracts';

export type AskPresentedRun = AskRun | RoutedLiveRun;
export interface OperandDraft {
  readonly price: string;
  readonly area: string;
}
export function operandDraft(inputs: AskInputs | null): OperandDraft {
  if (!inputs) return { price: '', area: '' };
  const minorUnits = BigInt(inputs.priceMinorUnits);
  const cents = String(minorUnits % 100n).padStart(2, '0');
  return {
    price: `${minorUnits / 100n}${cents === '00' ? '' : `.${cents}`}`,
    area: String(inputs.areaSquareMeters),
  };
}
/** Decimal input normalization only; all calculations and admission remain server owned. */
export function parseOperandDraft(draft: OperandDraft): AskInputs {
  const price = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(draft.price.trim());
  const area = draft.area.trim().replace(',', '.');
  if (!price || !/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(area)) throw new Error('Invalid operands');
  const minorUnits = BigInt(price[1]!) * 100n + BigInt((price[2] ?? '').padEnd(2, '0'));
  if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid price');
  return parseAskInputs({
    priceMinorUnits: Number(minorUnits),
    currency: 'BRL',
    areaSquareMeters: Number(area),
  });
}
