---
type: epic
title: 'Auditable comparables'
parent: initiative-real-estate-intelligence
covers: [CAP-21]
after: []
assignee: ''
risk: medium
---

# Auditable comparables

## Description

The `comparables` context (V2): a comparable set reproducible from stated, adjustable criteria, and
its screen.

## Outcome

For a buyer or analyst: a property is read against its comparables; the signal is CAP-21's
reproducible set.

## Requirements

The spec is the requirement source: children cite its ids CAP-21. Where an id is shared with another
epic, Description says which part this epic delivers.

## Done when

1. The set is reproducible from its criteria alone and changes deterministically with a criterion.
2. The result states criteria, candidates, matches, the median of the set and the subject's
   deviation.
3. The Comparables screen ships in production.

## Boundaries

The `comparables` context and its screen. A distance criterion that needs PostGIS waits for the ADR
owed with epic-map.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Waits on epic-properties because: it needs the candidates facade of `properties`.
- Waits on epic-web because: it needs the shell.
