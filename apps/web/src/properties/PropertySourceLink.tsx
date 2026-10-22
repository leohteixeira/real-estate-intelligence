import type { ReactNode } from 'react';
import { evidenceAnchor, revealEvidenceTarget } from './property-presentation';

export function PropertySourceLink({
  listingId,
  children,
}: {
  readonly listingId: string;
  readonly children: ReactNode;
}) {
  const id = evidenceAnchor(listingId);
  return (
    <a href={`#${id}`} onClick={() => revealEvidenceTarget(id)}>
      {children}
    </a>
  );
}
