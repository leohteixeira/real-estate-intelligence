/**
 * Deterministic layout of the synthetic city drawn on the landing page.
 *
 * Nothing here is market data: the prices are a fixed, made-up field that only
 * gives the scene its relief. Real figures come from the backend.
 */
export type ZoneId = 'centro' | 'oeste' | 'sul' | 'norte' | 'leste';

export interface CityBlock {
  readonly col: number;
  readonly row: number;
  readonly x: number;
  readonly z: number;
  readonly zone: ZoneId;
  readonly price: number;
  readonly height: number;
  readonly selected: boolean;
}

/** The journey has five stops, so scroll progress runs from 0 to 4. */
export const LAST_STAGE = 4;

export const GRID_SIZE = 22;
export const SELECTED_CELL = { col: 6, row: 11 } as const;
export const SELECTED_PRICE = 12480;
export const MIN_PRICE = 6000;
export const MAX_PRICE = 16000;
export const MIN_HEIGHT = 0.35;
export const MAX_HEIGHT = 4.4;

/** Every sixth street is an avenue, drawn as a wider gap. */
export const AVENUE_EVERY = 6;
const AVENUE_EXTRA = 0.4;
const CENTER_RADIUS = 3.4;

const lastIndex = GRID_SIZE - 1;
const halfSpan = (lastIndex + Math.floor(lastIndex / AVENUE_EVERY) * AVENUE_EXTRA) / 2;

/** World coordinate of a grid index along either axis, centred on the origin. */
export function axisPosition(index: number): number {
  return index + Math.floor(index / AVENUE_EVERY) * AVENUE_EXTRA - halfSpan;
}

/** World coordinate of the middle of the avenue that follows a grid index. */
export function avenuePosition(indexBeforeAvenue: number): number {
  return (axisPosition(indexBeforeAvenue) + axisPosition(indexBeforeAvenue + 1)) / 2;
}

export function zoneAt(col: number, row: number): ZoneId {
  const dx = col - lastIndex / 2;
  const dz = row - lastIndex / 2;

  if (Math.hypot(dx, dz) < CENTER_RADIUS) {
    return 'centro';
  }
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx < 0 ? 'oeste' : 'leste';
  }
  return dz < 0 ? 'norte' : 'sul';
}

function noise(col: number, row: number): number {
  const value = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function bump(col: number, row: number, cx: number, cz: number, spread: number): number {
  const distanceSquared = (col - cx) ** 2 + (row - cz) ** 2;
  return Math.exp(-distanceSquared / (2 * spread * spread));
}

export function priceAt(col: number, row: number): number {
  if (col === SELECTED_CELL.col && row === SELECTED_CELL.row) {
    return SELECTED_PRICE;
  }

  const raw =
    7200 +
    5200 * bump(col, row, 8, 8, 4) +
    4300 * bump(col, row, 15, 15, 4) +
    2600 * bump(col, row, 11, 10, 2.5) +
    (noise(col, row) - 0.5) * 1800;

  return Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, raw)) / 10) * 10;
}

export function heightFor(price: number): number {
  const ratio = (price - MIN_PRICE) / (MAX_PRICE - MIN_PRICE);
  return MIN_HEIGHT + Math.min(1, Math.max(0, ratio)) * (MAX_HEIGHT - MIN_HEIGHT);
}

export function buildCity(): CityBlock[] {
  const blocks: CityBlock[] = [];

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const price = priceAt(col, row);

      blocks.push({
        col,
        row,
        x: axisPosition(col),
        z: axisPosition(row),
        zone: zoneAt(col, row),
        price,
        height: heightFor(price),
        selected: col === SELECTED_CELL.col && row === SELECTED_CELL.row,
      });
    }
  }

  return blocks;
}
