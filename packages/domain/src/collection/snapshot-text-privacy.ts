const CONTACT =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s-]?\d{2}\b|(?:\+\d{1,3}\s+(?:\(0\)\s*)?)?\b\d{1,2}(?:[\s.]+\d{2}){4}\b|\+\d{1,3}[\s.-]*(?:(?:\(?\d{2,4}\)?[\s.-]+)?\d{3,5}[\s.-]*\d{4}|\d{3}(?:[\s.-]+\d{3}){2})\b|(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?(?:\d{4,5}[\s.-]*\d{4}|0800[\s.-]+\d{3}[\s.-]+\d{4})|(?:https?:\/\/|www\.)\S+|\b(?:[a-z0-9-]+\.)+[a-z]{2,63}(?:[/?#][^\s]*)?|\bCRECI(?:\s*(?:[-/]\s*[A-Z]{2}|\([A-Z]{2}\)))?\s*[:#-]?\s*(?:n\.?[º°o.]?\.?\s*[:#-]?\s*)?\d+(?:\.\d+)*[\w/-]*|\bunmasked\b/gi;

/** Shared deterministic text boundary for snapshot projection and event validation. */
export function maskSnapshotText(value: unknown, names: readonly string[] = []): string {
  if (typeof value !== 'string') throw new TypeError('Unsupported canonical listing text.');
  let masked = value;
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    masked = masked.replace(new RegExp(escaped, 'gi'), '[REDACTED]');
  }
  return masked.replace(CONTACT, '[REDACTED]');
}
