import { ExternalFailure, type SnapshotSanitizer, type RawListingDocument } from '@rei/application';
import {
  assertSnapshotIdentifier,
  maskSnapshotText,
  sanitizeSnapshotListing,
  snapshotContactNames,
} from '@rei/domain';

export class CanonicalSnapshotSanitizer implements SnapshotSanitizer {
  public sanitize(document: RawListingDocument) {
    try {
      if (document.mediaType !== 'application/json' || document.bytes.byteLength > 1_048_576)
        throw new TypeError('Unsupported canonical snapshot.');
      const input: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(document.bytes),
      );
      const names = snapshotContactNames(input);
      assertSnapshotIdentifier(document.sourceId, names);
      assertSnapshotIdentifier(document.sourceListingId, names);
      const url = new URL(document.sourceUrl);
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        !/[a-z]/i.test(url.hostname)
      )
        throw new TypeError('Unsafe snapshot provenance.');
      const path = decodeURIComponent(url.pathname);
      const hostLabels = url.hostname.split('.');
      if (
        path.includes('@') ||
        maskSnapshotText(path, names) !== path ||
        hostLabels.some((label) => maskSnapshotText(label, names) !== label) ||
        /(?:contact|whatsapp|creci)/i.test(url.hostname + path)
      )
        throw new TypeError('Unsafe snapshot provenance.');
      url.search = '';
      url.hash = '';
      if (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(document.observedAt) ||
        !Number.isFinite(Date.parse(document.observedAt))
      )
        throw new TypeError('Unsafe snapshot timestamp.');
      const listing = sanitizeSnapshotListing(input, names);
      return {
        document: Object.freeze({
          sourceId: document.sourceId,
          sourceListingId: document.sourceListingId,
          observedAt: document.observedAt,
          mediaType: document.mediaType,
          sourceUrl: url.toString(),
          bytes: new TextEncoder().encode(JSON.stringify(listing)),
        }),
        sanitizeParsed: (parsed: Parameters<typeof sanitizeSnapshotListing>[0]) => {
          try {
            return sanitizeSnapshotListing(parsed, [...names, ...snapshotContactNames(parsed)]);
          } catch {
            throw new ExternalFailure({
              kind: 'rejected',
              operation: 'collection.snapshot.sanitize',
            });
          }
        },
      };
    } catch {
      throw new ExternalFailure({ kind: 'rejected', operation: 'collection.snapshot.sanitize' });
    }
  }
}
