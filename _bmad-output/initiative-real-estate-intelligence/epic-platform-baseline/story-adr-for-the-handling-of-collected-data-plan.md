---
title: 'ADR for the handling of collected data'
type: 'chore'
ticket: '10'
created: '2026-10-10'
status: 'built'
baseline_revision: '9ac8da47633295dfcb5ba788d7d3da68bd29ead6'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/listing-sources.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** B10's collected-data safeguards are present across the product contract but are not an
accepted architecture decision. Without one record, implementations can diverge on the closed field
allowlist, image handling, snapshot retention, suppression and source-specific display permissions.

**Approach:** Accept ADR 0015 as the normative collected-data policy, propagate it through every
canonical architecture register and record the agent's owner-delegated decision in the platform
epic and external append-only decision log.

## Boundaries & Constraints

**Always:** Preserve the contract's exact closed allowlist; default both source permissions to
denied; sanitize before persistence; encrypt real-source snapshots at rest; delete them after 30
days while retaining their hash; discard photographs after deterministic fingerprinting; consult
suppression before collection; distinguish real-source snapshots from synthetic fixtures; describe
the rules as an engineering reading rather than legal advice.

**Never:** Add new collectable fields, authorize a currently disabled real source, select the
fingerprint algorithm, weaken removal semantics, store natural-person contacts or photographs, or
change the existing source-review outcomes.

## I/O & Edge-Case Matrix

| Scenario           | Input / State                                     | Expected Output / Behavior                                                                   | Error Handling                                                 |
| ------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Real listing       | Allowed source and payload                        | Only sanitized allowlisted data persists; snapshot is encrypted and expires after 30 days    | Reject or drop forbidden fields before persistence             |
| Image fetch        | Source explicitly permits images                  | Fingerprint is stored and photograph is discarded in memory                                  | No permission means no image request                           |
| Listing text       | Source permission established or absent           | Masked text may be shown only when allowed; otherwise expose change metadata and source link | Permission defaults to denied                                  |
| Suppressed listing | Stable source identity is on the suppression list | Collection does not recreate the listing or its artifacts                                    | Removal erases stored data and preserves the suppression entry |

</intent-contract>

## Code Map

- `specs/adrs/0015-handling-of-collected-data.md` — new normative privacy and source-policy record.
- `specs/README.md` and the canonical SPEC frontmatter — ADR discovery and preservation validation.
- Architecture Markdown and rendered HTML — accepted-decision register, fulfilled gap and affected
  capability mappings.
- Platform epic Notes — repository-local evidence of the delegated owner decision.
- `/workspace/docs/real-state-intelligence/decisions.md` — external append-only Portuguese decision
  record; never rewrite D-001.

## Tasks & Acceptance

**Execution:**

- [x] `specs/adrs/0015-handling-of-collected-data.md` — record the allowlist, forbidden data,
      image lifecycle, snapshot lifecycle, suppression and two source-register permissions.
- [x] `specs/README.md` and canonical SPEC frontmatter — index ADR 0015 and include it in the
      preservation-validated companion set.
- [x] Architecture Markdown and HTML — register ADR 0015, remove the fulfilled privacy-at-rest
      gap and bind it to CAP-2, CAP-3, CAP-4, CAP-8 and CAP-28 where those rules apply.
- [x] Platform epic Notes and the external decision log — record acceptance on the owner's behalf,
      append-only and with the required delegation marker in the repository.

**Acceptance Criteria:**

- Given the accepted ADR set, when a builder resolves B10's collected-data rules, then ADR 0015
  provides one coherent policy matching the canonical spec and source-review defaults.
- Given every canonical register, when preservation validation or a reader enumerates accepted
  decisions, then ADR 0015 appears and the collected-data decision is no longer marked as owed.
- Given the owner is absent, when the decision is audited, then the epic Notes and D-002 identify
  the delegated acceptance, rationale, reversibility and repository location.

## Implementation Notes

The automatic route is full because the ADR must be propagated consistently through more than five
files and the privacy impact raises the ticket's effective risk from low to high.

Implementation added ADR 0015, indexed it in the canonical SPEC and ADR index, synchronized the
Markdown and HTML architecture registers and capability bindings, recorded the delegated decision
in the epic and appended D-002 without changing D-001. During implementation self-check, the HTML
decision row was amended to expose the same CAP-2, CAP-3, CAP-4, CAP-8 and CAP-28 bindings as the
canonical Markdown map.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 1 finding — high 1, medium 0, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` ADR 0015 checked suppression only before persistence, allowing suppressed
    listing details or images to be fetched again — now requires a check as soon as discovery
    yields the stable source identity, before either fetch, and another check before persistence or
    downstream work for redelivery and reprocessing.

## Verification

**Commands:**

```sh
pnpm exec prettier --check \
  specs/README.md \
  specs/adrs/0015-handling-of-collected-data.md \
  _bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/epic-platform-baseline.md \
  _bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-adr-for-the-handling-of-collected-data-plan.md \
  _bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md \
  _bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md \
  docs/architecture/architecture.html \
  /workspace/docs/real-state-intelligence/decisions.md
pnpm exec markdownlint-cli2 --no-globs \
  :specs/README.md \
  :specs/adrs/0015-handling-of-collected-data.md \
  :_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/epic-platform-baseline.md \
  :_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-adr-for-the-handling-of-collected-data-plan.md \
  :_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md \
  :_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md
grep -Fq 'The allowlist is closed' specs/adrs/0015-handling-of-collected-data.md
grep -Fq 'Both default to denied' specs/adrs/0015-handling-of-collected-data.md
grep -Fq 'immediately discard the photograph' specs/adrs/0015-handling-of-collected-data.md
grep -Fq 'deleted 30 days after collection' specs/adrs/0015-handling-of-collected-data.md
grep -Fq 'collection checks suppression before fetching' specs/adrs/0015-handling-of-collected-data.md
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
```

Expected: formatting and Markdown lint report no errors; the five policy-contract assertions cover
the four matrix scenarios; the complete repository quality gate passes.

## Auto Run Result

### Summary

Accepted ADR 0015 establishes the normative collected-data policy for real listing sources: a
closed field allowlist, source permissions that default to denied, in-memory image disposal after
deterministic fingerprinting, encrypted and sanitized 30-day snapshots, and suppression checks
before fetching and again before persistence. The decision is indexed in every canonical register
and recorded as an owner-delegated decision in the epic and external append-only log.

### Files changed

- `specs/adrs/0015-handling-of-collected-data.md` — records the accepted collection, permission,
  image, snapshot and suppression rules.
- `specs/README.md` — indexes ADR 0015.
- `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`
  — includes ADR 0015 in the preservation-validated companion set.
- `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md` —
  registers ADR 0015, closes the collected-data gap and maps the decision to affected capabilities.
- `docs/architecture/architecture.html` — synchronizes the rendered decision register and
  capability bindings.
- `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/epic-platform-baseline.md`
  — records the owner-delegated acceptance in the epic Notes.
- `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-adr-for-the-handling-of-collected-data-plan.md`
  — records implementation, review triage and verification evidence.
- `/workspace/docs/real-state-intelligence/decisions.md` — appends the Portuguese D-002 decision
  without rewriting D-001.

### Review findings

- First-pass patches: one high entry. ADR 0015 now requires suppression to be checked as soon as a
  stable source identity is discovered, before fetching either the listing payload or images, and
  again before persistence or downstream work.
- Deferred: none.
- Rejected: none.
- First-pass patched counts by entry verdict: high 1, medium 0, low 0.

### Follow-up review recommendation

`true`. The first pass patched one high entry, so the workflow requires exactly one follow-up
review after this built result is committed.

### Verification performed

- Prettier check passed for the seven changed repository files and the external decision log.
- Markdownlint passed for all six changed repository Markdown files with zero errors.
- Five policy-contract assertions passed for the closed allowlist, default-denied permissions,
  image disposal, 30-day deletion and pre-fetch suppression rule.
- `pnpm run lint` passed.
- `pnpm run typecheck` passed for all eight workspace projects in scope.
- `pnpm run test` passed: domain 11, web 14, infrastructure 3, API 7 and worker 5 tests; projects
  configured without tests exited successfully.
- `pnpm run build` passed for all eight workspace projects in scope.

### Residual risks

The web build retains its pre-existing Vite warning for the 536.96 kB `CityScene` chunk. It does not
affect this documentation-only story. A required follow-up review remains because the first pass
patched a high-severity privacy invariant.
