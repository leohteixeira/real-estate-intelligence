---
type: initiative
title: 'Real Estate Intelligence'
parent: none
covers:
  [
    CAP-1,
    CAP-2,
    CAP-3,
    CAP-4,
    CAP-5,
    CAP-6,
    CAP-7,
    CAP-8,
    CAP-9,
    CAP-10,
    CAP-11,
    CAP-12,
    CAP-13,
    CAP-14,
    CAP-15,
    CAP-16,
    CAP-17,
    CAP-18,
    CAP-19,
    CAP-20,
    CAP-21,
    CAP-22,
    CAP-23,
    CAP-24,
    CAP-25,
    CAP-26,
    CAP-27,
    CAP-28,
    CAP-29,
    CAP-30,
    CAP-31,
    CAP-32,
    CAP-33,
  ]
after: []
assignee: ''
risk: high
---

# Real Estate Intelligence

## Description

A normalized, historical and queryable base of real-estate listings for the city of São Paulo, with
a market-intelligence layer in which every figure is deterministic, dated and traceable, and a
language model routes and explains but never computes. The spec beside this file is the contract;
this file holds how the work is split.

## Outcome

For a buyer, investor, broker, analyst or portfolio evaluator: a market can be read, not just a
listing found. The three success signals of the spec show it worked.

## Requirements

The spec is the requirement source:
`_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
CAP-1 to CAP-33.

## Done when

1. The first success signal of the spec is walked on the deployed stack with synthetic São Paulo.
2. The second success signal holds: a price-per-square-meter run streams to a terminal event, pauses
   below 0.85 and survives a restart of the API, the worker and the AI service.
3. The third success signal holds once a real source passes its review: collected listings hold no
   personal data, the privacy notice names the source and a removed listing stays out.
4. Sign-in opens Operations and Review to an authorized operator and to no one else.
5. Every V2 capability is in production or dropped with the owner's agreement.

## Boundaries

One epic per bounded context of ADR 0011 that the work touches, plus one epic for `apps/web`, opened
by a platform baseline. The non-goals of the spec apply. Two tracer paths run in parallel: synthetic
dataset, collection, one resolved property, median asking price per m², Place overview; and a
price-per-square-meter run from the API through the AI service to the headless client.

- Touch point: `repos/portifolio-shared-keycloak` — consumed as the identity provider; owner:
  epic-authentication-and-operations
- Touch point: GeoSampa fiscal blocks — loaded as reference geography; owner: epic-map
- Touch point: ITBI spreadsheets — read as a transaction source once allowed; owner:
  epic-market-analytics
- Touch point: Vercel AI Gateway — called for the decision and generative models; owner: epic-ask
- Touch point: the owner's VPS, domain and TLS — configured for deployment; owner:
  epic-platform-baseline
- Touch point: `/workspace/CLAUDE.md` — corrected; owner: epic-platform-baseline

## References

- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  section Capabilities
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  `docs/architecture/architecture.html`; ADRs under `specs/adrs/`
- design — `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/ux.md`;
  `apps/web/DESIGN.md`
- constraint —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/listing-sources.md`;
  spec, Constraints, Privacy and sources

## Notes

- Decision: epics follow the bounded contexts plus one for the web application (owner, 2026-10-10).
- Decision: the two tracer paths run in parallel (owner, 2026-10-10).
- Decision: epics 1 to 6 are incepted into stories now; epics 7 to 14 keep an envelope (owner,
  2026-10-10).
- Decision: decisions that several epics adopt live in the architecture: event envelope and naming
  in ADR 0012, facades and contract shapes per context in ADR 0011, policies and the failure set in
  ADR 0013. Each providing epic opens with a contract-and-stub entry.
- Parked: the third success signal waits for a real listing source (Caixa's written answer).
