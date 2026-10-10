---
type: epic
title: 'Sign-in and protected operations'
parent: initiative-real-estate-intelligence
covers: [CAP-32, CAP-26, CAP-27]
after: []
assignee: ''
risk: high
---

# Sign-in and protected operations

## Description

The first increment after the MVP: the `identity` context behind Keycloak, the Operations screens
and the review of uncertain matches, with the audit log completed.

## Outcome

For the data operator: sources, runs and uncertain matches are visible and actionable behind a
sign-in; the signal is CAP-32's refusal of an anonymous visitor and an operator reaching Operations
and Review.

## Requirements

The spec is the requirement source: children cite its ids CAP-32, CAP-26, CAP-27. Where an id is
shared with another epic, Description says which part this epic delivers.

## Done when

1. Operations, review, alert rules and followed items are refused to an anonymous visitor and to a
   signed-in user without the role; the public surface works unchanged.
2. With a fixture holding one degraded source the operator sees the figures of `ux.md`, stops a run
   and reprocesses failed snapshots without a collection.
3. A match from 0.50 up to 0.90 is merged, kept separate or skipped with the evidence in view; the
   decision is audit-logged and can be undone.
4. Running in production against the shared Keycloak.

## Boundaries

The `identity` context, the protected screens and the completion of `audit`. Not alerts.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`

## Notes

- Open question (spec): workspace isolation or ownership per user only.
- Unknown: the Keycloak ADR (realm, roles, session validation) is owed before the first entry.
- Waits on epic-collection because: it needs collection runs, the source register and the operator
  commands.
- Waits on epic-properties because: it needs matches awaiting review.
- Waits on epic-ask because: it needs run and provider figures.
- Waits on epic-web because: it needs the shell.
