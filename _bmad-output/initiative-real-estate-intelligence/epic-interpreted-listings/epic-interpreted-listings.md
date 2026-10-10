---
type: epic
title: 'Model-interpreted attributes and model-assisted matching'
parent: initiative-real-estate-intelligence
covers: [CAP-30, CAP-31]
after: []
assignee: ''
risk: high
---

# Model-interpreted attributes and model-assisted matching

## Description

V2: attributes a model reads from a description, told apart from measured ones, and description
similarity as further match reasons.

## Outcome

For a reader: interpreted attributes are visible and labelled; the signal is CAP-30 and CAP-31.

## Requirements

The spec is the requirement source: children cite its ids CAP-30, CAP-31. Where an id is shared with
another epic, Description says which part this epic delivers.

## Done when

1. Each interpreted attribute is stored with its prompt version and source sentence and shown tagged
   "Interpreted, not measured".
2. Embeddings add reasons to the same match score, measured against a labelled dataset; a merge is
   still decided by the thresholds.
3. Running in production.

## Boundaries

`properties` and `apps/ai`. The listing-text rule covers any excerpt.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Waits on epic-properties because: it needs listings and entity resolution.
- Waits on epic-ask because: it needs the AI service.
