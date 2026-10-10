---
type: epic
title: 'Market movement and recorded sale figures'
parent: initiative-real-estate-intelligence
covers: [CAP-22, CAP-33]
after: []
assignee: ''
risk: medium
---

# Market movement and recorded sale figures

## Description

V2 of the `market` context: movement over 30-day, 6-month and 12-month windows, the ranking of
neighborhoods, and place-level sale figures from recorded transactions.

## Outcome

For an analyst: how a city, zone or neighborhood is moving; the signal is CAP-22 on the fixture
series.

## Requirements

The spec is the requirement source: children cite its ids CAP-22, CAP-33. Where an id is shared with
another epic, Description says which part this epic delivers.

## Done when

1. Each figure of CAP-22 equals its documented rule on the fixture series.
2. A place above the minimum of transactions shows the median declared value per m² tagged `Sale`;
   one below reads "None available".
3. The Market screen ships in production.

## Boundaries

The `market` context and the Market screen. CAP-33 stays unexposed until a transaction source is
enabled.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Unknown: the minimum number of transactions; and CAP-33 waits for the written answer of the
  Secretaria Municipal da Fazenda.
- Waits on epic-market because: it needs price facts and the monthly series.
- Waits on epic-web because: it needs the shell.
