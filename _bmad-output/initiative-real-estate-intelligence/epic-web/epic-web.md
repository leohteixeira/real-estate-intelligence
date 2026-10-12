---
type: epic
title: 'Place-first web application'
parent: initiative-real-estate-intelligence
covers: [CAP-19, CAP-20, CAP-28]
after: []
assignee: ''
risk: medium
---

# Place-first web application

## Description

`apps/web`: the Placa shell and every MVP screen and system state of `ux.md`, on a phone and on a
desktop, in Brazilian Portuguese and English, reading every value from `/api/v1`; the landing page
made ready to ship; the public privacy notice. Of CAP-28 it delivers the notice page and its links.

## Outcome

For a visitor: the market of a place is readable in minutes and a run can be followed; the signal is
the first and second success signals of the spec walked on the deployed application.

## Requirements

The spec is the requirement source: children cite its ids CAP-19, CAP-20, CAP-28. Where an id is
shared with another epic, Description says which part this epic delivers.

## Done when

1. Every MVP screen and system state of `ux.md` exists at 390 px and from 960 px up in the light
   theme, in both locales with locale-formatted numbers, each figure with its provenance line and
   each price tagged `Asking` or `Sale`.
2. On the deployed stack a visitor opens a neighborhood, reads its median with count, sources and
   computation time, opens the property whose three listings were resolved into one and never sees
   an asking price shown as a sale.
3. The Ask screens follow a run over SSE to a terminal state, including the pause for confirmation
   and every run state of `ux.md`.
4. The automated accessibility check and a keyboard walk of every MVP screen pass at WCAG 2.2 level
   AA, with the result recorded.
5. The privacy notice is reachable from every public screen and from the landing page in both
   locales, and the landing page ships: fonts self-hosted, the WebGL scene reviewed in a real
   browser with the review recorded, the demo address and the repository visibility set.

## Boundaries

`apps/web`, except the headless client. It computes no business value. Not V2 or protected screens.

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`
- design — `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/ux.md`;
  `apps/web/DESIGN.md`; artboards under `docs/design/canvas/project/`

## Notes

- Decision: the web application is one epic with `/api/v1` as its contract to the context epics
  (owner, 2026-10-10).
- Decision: ADR 0028 accepts React Router declarative mode, TanStack Query, bundled i18next/
  react-i18next and Vitest/Testing Library/jsdom after the foundation phase of ADR 0016. Dependency
  installation and browser proof belong to implementing entries; integration remains typed Vitest
  under ADR 0020 (agent, on the owner's behalf, 2026-10-12; D-051).
- Open question (spec): who designs the sign-in entry, the signed-in shell and the theme switch. No
  MVP entry waits on it.
- Decision: D-052 scopes entry 2 to the existing Placa shell/plate and one event-fed median with
  actual contributor/source/time evidence, not prepared counts or illustrated artboard values.
  `/places` opens the registered synthetic Bela Vista neighborhood; `/` preserves the landing.
  Same-origin `/api/v1` proxies and self-hosted existing Barlow faces support real browser proof.
  Unimplemented/V2/protected controls stay absent; proper place names stay untranslated. The
  complete shell and remaining panels belong to later entries (agent, on the owner's behalf,
  2026-10-12).
- Decision: D-053 pins Query 5.104.1, published on 2026-10-02 and compatible with React 19,
  rather than adding release-age exclusions for the newly published 5.104.2. Existing supply-chain
  and verification gates remain unchanged (agent, on the owner's behalf, 2026-10-12).
- Decision: D-054 completes the public shell with Places, Search and Ask only. Place-scoped
  `/search/:placeId` and `/ask/:placeId` are genuine contract-backed entry screens, explicitly
  stating that their full web workflows are not yet included; no inert forms, prepared figures
  or simulated errors. Full screens remain entries 6/9/16; Privacy body and real footer links
  remain entry 10. Index routes open Bela Vista. Preserve selected place, Placa, local fonts,
  bundled per-screen catalogues, abortable validated API reads and formatting conventions;
  no V2/protected navigation or VPS unlock (agent, on the owner's behalf, 2026-10-12).
- Parked: the third success signal names a real source in the privacy notice; it waits with
  epic-collection.
- Decision: D-055 extracts the live median's Figure/Provenance and implements contract-typed
  PropertyRow without shipping Search early. A test-only Vite entry outside production routes
  verifies shared rows in Chromium; the owned Compose campaign verifies the actual shell/figure.
  Adopt @axe-core/playwright 4.13.0 as a shared WCAG 2.2 AA harness, without rule/region exclusions;
  record incomplete/manual checks rather than claiming full conformance before entry 12.
  Semantic token contrast checks require only real foreground/background roles. Accept
  `line-strong = #7f8ba2` for essential borders on white, porcelain and enamel-50, synchronizing
  DESIGN.md, its sidecar and the canvas mirror; preserve the remaining Placa world. Never use
  that border as an essential marker on enamel-100 or yellow alone on light backgrounds.
  Keep TypeScript/Vitest integration, supply-chain gates and sandbox security unchanged
  (agent, on the owner's behalf, 2026-10-12).
- Waits on epic-platform-baseline because: it needs the contract conventions and the deployed stack.
- Decision: D-056 delivers shared loading, no-results, read-error and stale-figure states in both
  locales, preserving Placa and backend evidence. Preserve a known plate, filters, retained
  figures and explicit manual retry; expose only a valid public request UUID, never raw errors.
  Failure-source evidence and authorized collection destinations are optional caller inputs,
  never inferred from collection timestamps. Empty results receive genuine relax/widen actions
  and an optional available/authorized alert action. Keep the incremental Search boundary;
  exercise unused states through labelled test-only fixtures outside production routes/build,
  plus forced conditions and recovery on the actual owned Compose UI. No protected navigation,
  fabricated figures, automatic retries, gate changes or VPS unlock
  (agent, on the owner's behalf, 2026-10-12).
- Waits on epic-collection because: it needs the list of sources for the privacy notice.
- Decision: D-057 completes entry 5 from validated public endpoints: retain event-fed place and
  immediate-parent medians; label prepared counts/secondary figures/neighbours/monthly series
  separately, with individual evidence, genuine zeros and unavailable sale/gaps. Use a labelled
  place-identity schematic, never copied streets, tiles or geographic inference. Largest reductions
  read persisted history only, bounded to three rows with abortable public detail enrichment;
  keep historical percentage/source/date distinct from below-median deviation. Rows lead to the
  existing place-scoped Search, not absent Property routes; an empty history stays empty. The
  native question form forwards a draft through navigation state to the same-place Ask entry,
  never URL/log/local storage, and explicitly does not execute a run before entry 9. Preserve
  independent read recovery, Placa, both locales and all gates; no VPS unlock
  (agent, on the owner's behalf, 2026-10-12).
- Waits on epic-properties because: it needs the search, property, listing and largest-reductions
  shapes.
- Decision: D-058 restores the authored compact overview after the independent finish review's
  `fix` disposition. Keep every figure's origin, count, computation time and freshness identifiable;
  retain full individual evidence and source links in keyboard-accessible native disclosures.
  Place the complete twelve-month table under a labelled disclosure, preserve chart gaps and
  equal values, and derive labelled chart ranges from supplied values for presentation only.
  Restore compact neighbour comparisons, top-aligned panels and the porcelain phone question
  below the plate; preserve the blue desktop header and unexecuted draft semantics. Apply only
  the six material findings as one batch, recapture the same matrix, and obtain an independent
  verdict without weakening tests, 44px targets or gates (agent, on the owner's behalf, 2026-10-12).
- Waits on epic-market because: it needs the place-figure, neighbours and series shapes.
- Waits on epic-ask because: it needs the run and SSE shapes.
- Tracer bullet: entry 2; entry 1 precedes it because the router and data-fetching choice shapes
  every screen.
- Assumption: the map view of Search is absent from the MVP, as the map is CAP-24.
- Assumption: places come from epic-properties (entry 3.3) and the sources with their licence from
  epic-collection (entry 2.4).
