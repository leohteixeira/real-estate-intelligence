import { parseCollectedListing, type CollectedListing } from './collection.events.js';
import { maskSnapshotText } from './snapshot-text-privacy.js';
export { maskSnapshotText } from './snapshot-text-privacy.js';

const NAME_FIELD =
  /^(?:name|firstName|lastName|fullName|personName|contactName|ownerName|agentName|brokerName|sellerName)$/i;

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Unsupported canonical listing shape.');
  return value as Record<string, unknown>;
}

/** Extract only explicitly labelled contact names; arbitrary prose is not name recognition. */
export function snapshotContactNames(value: unknown, depth = 0): readonly string[] {
  if (depth > 12) throw new TypeError('Unsupported canonical listing nesting.');
  if (value === null || typeof value !== 'object') return [];
  const names: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (NAME_FIELD.test(key) && typeof child === 'string' && child.trim().length >= 2)
      names.push(child.trim());
    else names.push(...snapshotContactNames(child, depth + 1));
  }
  return names;
}

/** Closed deterministic projection; unknown and nested contact/photo/unit fields never survive. */
export function sanitizeSnapshotListing(
  value: unknown,
  knownNames: readonly string[] = snapshotContactNames(value),
): CollectedListing {
  const listing = object(value);
  const location = object(listing.location);
  const advertiser = object(listing.advertiser);
  if (!Array.isArray(listing.features) || !Array.isArray(listing.imageFingerprints))
    throw new TypeError('Unsupported canonical listing arrays.');
  // Only explicitly versioned, already-computed fingerprints are supported for real snapshots.
  if (
    listing.imageFingerprints.some(
      (item) =>
        typeof item !== 'string' || !/^(?:sha256:[a-f0-9]{64}|dhash64-v1:[a-f0-9]{16})$/.test(item),
    )
  )
    throw new TypeError('Unsupported canonical image fingerprint.');
  return parseCollectedListing(
    {
      propertyType: listing.propertyType,
      askingPriceMinorUnits: listing.askingPriceMinorUnits,
      currency: listing.currency,
      areaSquareMeters: listing.areaSquareMeters,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      parkingSpaces: listing.parkingSpaces,
      features: [...new Set(listing.features.map((item) => maskSnapshotText(item, knownNames)))],
      location: {
        city: maskSnapshotText(location.city, knownNames),
        stateCode: location.stateCode,
        neighborhood: maskSnapshotText(location.neighborhood, knownNames),
        street: maskSnapshotText(location.street, knownNames),
      },
      listedAt: listing.listedAt,
      advertiser: {
        type: advertiser.type,
        agencyName:
          advertiser.type === 'private'
            ? null
            : maskSnapshotText(advertiser.agencyName, knownNames),
      },
      maskedDescription: maskSnapshotText(listing.maskedDescription, knownNames),
      imageFingerprints: listing.imageFingerprints,
    },
    true,
    true,
  );
}

export function assertSnapshotIdentifier(value: string, names: readonly string[] = []): void {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value) ||
    maskSnapshotText(value, names) !== value
  )
    throw new TypeError('Unsafe snapshot identifier.');
}
