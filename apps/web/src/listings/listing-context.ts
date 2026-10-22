import type { ListingDetail, PropertyResponse } from '@rei/contracts';

/** A Listing's published location never substitutes for verified Property ancestry. */
export function verifiedListingProperty(
  listing: ListingDetail | undefined,
  response: PropertyResponse | undefined,
): PropertyResponse | undefined {
  if (!listing || !response || response.property.summary.id !== listing.propertyId) return;
  const member = response.property.listings.find((item) => item.id === listing.id);
  if (
    member?.propertyId !== listing.propertyId ||
    member.position !== listing.position ||
    listing.position < 1 ||
    listing.position > response.property.listings.length
  )
    return;
  return response;
}
