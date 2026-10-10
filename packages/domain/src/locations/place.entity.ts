import { DomainValidationError } from '../shared/index.js';
import type { PlaceDetail } from './locations.read.types.js';

const kinds = ['country', 'state', 'city', 'zone', 'neighborhood', 'street-block'] as const;
function invalid(): never {
  throw new DomainValidationError('Invalid reference place.', 'place');
}
function freeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}
/** Owned immutable reference geography, including explicit fixture ranges and adjacency. */
export class Place {
  public readonly detail: PlaceDetail;
  public constructor(detail: PlaceDetail) {
    const level = kinds.indexOf(detail.kind);
    if (
      level < 0 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(detail.id) ||
      detail.id.length > 200 ||
      !detail.name.en.trim() ||
      !detail.name.ptBR.trim() ||
      !Number.isSafeInteger(detail.propertyCount) ||
      detail.propertyCount < 0
    )
      invalid();
    if (
      detail.breadcrumbs.length !== level + 1 ||
      new Set(detail.breadcrumbs.map((crumb) => crumb.id)).size !== level + 1 ||
      detail.breadcrumbs.some((crumb, index) => crumb.kind !== kinds[index])
    )
      invalid();
    const own = detail.breadcrumbs.at(-1)!;
    if (
      own.id !== detail.id ||
      own.name.en !== detail.name.en ||
      own.name.ptBR !== detail.name.ptBR ||
      detail.parentId !== (level === 0 ? null : detail.breadcrumbs[level - 1]!.id)
    )
      invalid();
    if ((detail.kind === 'street-block') !== (detail.block !== null)) invalid();
    if (
      detail.block &&
      (!detail.block.streetName.trim() ||
        detail.block.origin !== 'prepared-fixture' ||
        !Number.isSafeInteger(detail.block.fromNumber) ||
        !Number.isSafeInteger(detail.block.toNumber) ||
        detail.block.fromNumber < 0 ||
        detail.block.toNumber < detail.block.fromNumber)
    )
      invalid();
    if (
      detail.coordinates &&
      (!Number.isFinite(detail.coordinates.latitude) ||
        !Number.isFinite(detail.coordinates.longitude) ||
        Math.abs(detail.coordinates.latitude) > 90 ||
        Math.abs(detail.coordinates.longitude) > 180)
    )
      invalid();
    if (
      (detail.kind !== 'neighborhood' && detail.adjacentPlaceIds.length > 0) ||
      new Set(detail.adjacentPlaceIds).size !== detail.adjacentPlaceIds.length ||
      detail.adjacentPlaceIds.includes(detail.id)
    )
      invalid();
    this.detail = freeze({
      ...detail,
      name: { ...detail.name },
      breadcrumbs: detail.breadcrumbs.map((crumb) => ({ ...crumb, name: { ...crumb.name } })),
      adjacentPlaceIds: [...detail.adjacentPlaceIds],
      block: detail.block && { ...detail.block },
      coordinates: detail.coordinates && { ...detail.coordinates },
    });
    Object.freeze(this);
  }
  public containsNumber(number: number): boolean {
    const range = this.detail.block;
    return (
      Number.isSafeInteger(number) &&
      range !== null &&
      number >= range.fromNumber &&
      number <= range.toNumber
    );
  }
}
export function selectUniqueBlock(candidates: readonly Place[], number?: number): Place | null {
  const matching = candidates.filter(
    (place) =>
      place.detail.kind === 'street-block' &&
      (number === undefined || place.containsNumber(number)),
  );
  return matching.length === 1 ? matching[0]! : null;
}
