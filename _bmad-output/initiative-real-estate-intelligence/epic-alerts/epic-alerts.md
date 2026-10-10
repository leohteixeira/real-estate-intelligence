---
type: epic
title: 'Alert rules and inbox'
parent: initiative-real-estate-intelligence
covers: [CAP-23]
after: []
assignee: ''
risk: medium
---

# Alert rules and inbox

## Description

The `alerts` context: rules on a place or on followed properties, and the in-app inbox.

## Outcome

For a signed-in user: the four alert kinds fire from fixed rules; the signal is CAP-23's fixture
run.

## Requirements

The spec is the requirement source: children cite its ids CAP-23. Where an id is shared with another
epic, Description says which part this epic delivers.

## Done when

1. A collection run over the fixture produces exactly the expected alerts of the four kinds, each
   stating its values and linking to the property.
2. Rules and followed items belong to the signed-in user.
3. The Alerts screen ships in production.

## Boundaries

The `alerts` context and its screen. In-app inbox only.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Waits on epic-authentication-and-operations because: it needs a signed-in user.
- Waits on epic-comparables because: it needs the comparables median used by the below-market alert.
- Waits on epic-properties because: it needs listing events.
