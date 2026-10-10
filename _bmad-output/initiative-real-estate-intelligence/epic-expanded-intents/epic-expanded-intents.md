---
type: epic
title: 'Remaining natural-language intents'
parent: initiative-real-estate-intelligence
covers: [CAP-25]
after: []
assignee: ''
risk: medium
---

# Remaining natural-language intents

## Description

V2: `listing_search`, `property_history`, `region_statistics` and `comparables` become executable,
one intent at a time.

## Outcome

For a visitor: questions beyond the price per square meter; the signal is CAP-25.

## Requirements

The spec is the requirement source: children cite its ids CAP-25. Where an id is shared with another
epic, Description says which part this epic delivers.

## Done when

1. Each intent executes only through its typed deterministic capability and returns tool results the
   model only explains.
2. Each ships with its evaluation dataset.
3. Running in production.

## Boundaries

`apps/ai` tools and the `ask` context.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Waits on epic-ask because: it needs the run pipeline.
- Waits on epic-properties because: it needs search and property history.
- Waits on epic-market because: it needs region statistics.
- Waits on epic-comparables because: it needs comparables.
