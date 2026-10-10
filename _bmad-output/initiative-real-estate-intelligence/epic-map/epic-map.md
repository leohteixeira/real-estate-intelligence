---
type: epic
title: 'Map with the block layer'
parent: initiative-real-estate-intelligence
covers: [CAP-24]
after: []
assignee: ''
risk: medium
---

# Map with the block layer

## Description

V2: the map of a place with markers and the price-per-m²-per-block layer over the GeoSampa fiscal
blocks.

## Outcome

For a visitor: the properties and prices of a place on a map; the signal is CAP-24.

## Requirements

The spec is the requirement source: children cite its ids CAP-24. Where an id is shared with another
epic, Description says which part this epic delivers.

## Done when

1. The map shows the same filtered properties as the list and no marker locates a unit.
2. The block layer credits GeoSampa and is published under CC BY-SA 4.0.
3. The Map screen ships in production.

## Boundaries

The Map screen, `ReferenceGeography` in `locations` and PostGIS.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Unknown: the tile provider and PostGIS ADR is owed before the first entry.
- Waits on epic-properties because: it needs the filtered properties.
- Waits on epic-market because: it needs the price per m² per block.
- Waits on epic-web because: it needs the shell.
