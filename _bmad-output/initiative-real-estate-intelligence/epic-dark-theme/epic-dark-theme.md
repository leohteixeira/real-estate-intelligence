---
type: epic
title: 'Dark theme'
parent: initiative-real-estate-intelligence
covers: [CAP-29]
after: []
assignee: ''
risk: low
---

# Dark theme

## Description

V2: a second, dark token set for every screen, following the system preference with a switch in the
shell.

## Outcome

For a user: every screen in a dark theme at WCAG 2.2 level AA; the signal is CAP-29.

## Requirements

The spec is the requirement source: children cite its ids CAP-29. Where an id is shared with another
epic, Description says which part this epic delivers.

## Done when

1. Every screen renders from the dark token set under the same rules.
2. The theme follows the system preference until the switch overrides it, and the choice is
   remembered.
3. Running in production.

## Boundaries

`apps/web` tokens and styles.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Unknown: `apps/web/DESIGN.md` forbids a dark ground today; its owner revises that rule first. The
  theme switch has no artboard.
- Waits on epic-web because: it needs every screen and the shell.
