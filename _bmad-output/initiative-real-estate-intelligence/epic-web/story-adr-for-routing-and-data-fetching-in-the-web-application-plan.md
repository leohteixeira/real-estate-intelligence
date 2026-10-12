---
title: 'ADR for routing and data fetching in the web application'
type: 'chore'
ticket: '1'
created: '2026-10-12'
status: done
baseline_revision: '9ec426167d07e4ce6dd0f1f0efe325f7c94c3998'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/specs/adrs/0016-typescript-6-toolchain.md
  - /workspace/repos/real-estate-intelligence/docs/design/content-and-locale.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The foundation deliberately deferred routing and data fetching. The web shell needs
an accepted decision naming those approaches, internationalization and component testing before
implementation, without changing the backend-owned business rules or the Placa design.

**Approach:** Record an Accepted ADR for React Router declarative mode, TanStack Query, bundled
i18next/react-i18next resources and Vitest with Testing Library/jsdom. Record delegated owner
acceptance and alternatives/costs, link the decision from the ADR index and Web epic, and leave
dependency installation and UI implementation to subsequent stories.

</intent-contract>

## Implementation Notes

- Oneshot: estimated fewer than 100 added/modified documentation lines across three implementation
  files, plus this workflow plan; no executable code, package manifest or accepted ADR changes.
- Record D-051 append-only outside Git before implementing ADR 0028. The user's unattended owner
  delegation overrides interactive skill approval and generic ADR/plan output locations; retain
  this ticket plan and `specs/adrs/` as the authoritative repository locations.
- Write `specs/adrs/0028-web-routing-data-and-component-tests.md` with Context, Decision, Options
  considered and Consequences, explicitly extending the post-foundation phase of ADR 0016.
- Add the ADR index row in `specs/README.md`; resolve only the routing/data open question in
  `_bmad-output/initiative-real-estate-intelligence/epic-web/epic-web.md` with delegated acceptance.
- Official documentation and read-only registry metadata checked on 2026-10-12: React Router
  8.4.0 supports the current Node 24/React 19.2.8 pins; Query documentation is v5. Exact dependency
  pins belong to the first implementing story. Do not claim any new component or browser proof.
- Implemented ADR 0028 (80 lines), one index row and the resolved Web epic decision; D-051 was
  appended before those changes. Existing accepted ADRs, manifests and executable files are
  unchanged. Integration contains only TypeScript files; no new browser journey exists here.
- Root lint, strict typecheck (including integration), all 2,148 unit tests, eight builds and
  coverage passed on 2026-10-12. Coverage thresholds remain 80/80/80/75; the pre-existing WebGL
  chunk-size warning is unchanged. Coverage output: `/tmp/rei-web-adr-coverage.log`.

## Plan Change Log

## Review Triage Log

### 2026-10-12 — Review pass

- verdicts: 1 findings — high 0, medium 0, low 1, false 0, maybe-false 0
- findings:
  - `[low]` `[patch]` ADR 0028 omitted the reassessment trigger mandated by ADR 0001:14.
    Parent read the complete process ADR and confirmed Consequences named migration costs but
    no trigger. Added explicit required-capability, supported-toolchain and measured-limitation
    triggers to the new record before publication; no choice or public surface changed.

## Verification

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all root checks pass.
- `pnpm run test:coverage` — existing coverage thresholds remain unchanged and pass.
- `pnpm exec prettier --check <four changed Markdown files>` — formatting passes.
- `pnpm exec markdownlint-cli2 --no-globs <four changed Markdown files>` — Markdown lint passes.
- `git diff --check` — no whitespace errors.
- Inspect the accepted ADR against entry 6.1: all four choices, context, alternatives, costs,
  delegated owner/date/D-051, current toolchain compatibility and links are explicit; no code,
  dependency changes, UI fidelity claim, VPS access or secret-file access is introduced.

## Auto Run Result

Workflow terminal status: built. Entry 6.1's verify is met: ADR 0028 is Accepted in `specs/adrs/`
by the agent under the owner's explicit delegation, with D-051 recorded before implementation.
The choices are recorded, not yet installed or rendered. Documentation-writer kept this an
explanation of context/options/costs; decision-record supplied the four-section decision shape;
ADR 0001 additionally supplies the mandatory reassessment trigger. No production code changed.

### Files changed

- `specs/adrs/0028-web-routing-data-and-component-tests.md` — accepted choices, alternatives,
  compatibility, consequences, reassessment trigger and official references.
- `specs/README.md` — numbered decision index entry.
- `_bmad-output/initiative-real-estate-intelligence/epic-web/epic-web.md` — replaces only the
  resolved router/data question with D-051 and delegated acceptance; parked questions remain.
- `_bmad-output/initiative-real-estate-intelligence/epic-web/story-adr-for-routing-and-data-fetching-in-the-web-application-plan.md`
  — immutable intent, route, implementation evidence, review triage and acceptance ledger.

### Review outcome

Quick lens completed synchronously, with one parent-verified low finding and one trivial patch:
the missing reassessment trigger. Patched counts: high 0, medium 0, low 1. No findings deferred or
rejected. Follow-up review recommendation: false; no specific unverified repair risk remains.

### Verification evidence

- Root lint, strict typecheck including integration, 2,148 unit tests and all eight builds passed
  both before and after the documentation patch. Coverage passed twice with unchanged
  statements/lines/functions 80% and branches 75% thresholds in every workspace.
- Post-patch coverage output: `/tmp/rei-web-adr-patched-coverage.log`.
- Prettier and scoped Markdown lint passed on all four changed files; staged/unstaged whitespace
  checks passed. Parent read the complete baseline diff, including both new files, and the repair.
- `pnpm run test:integration:list` passed and discovered the 73 current Vitest cases. All 40 files
  under `integration/` are TypeScript. No integration source or configuration changed in this entry.
- The actual unchanged-code full integration execution immediately before this entry passed
  73 cases in 29 files, 1,894.03 seconds; evidence is
  `/tmp/rei-model-parent-review-integration-41YWjv.log`. Discovery is not claimed as a rerun.
- Manual ADR inspection confirms all four required choices, normative process sections,
  delegated owner/date/D-051, compatible React Router metadata and resolvable local reference.

### Residual scope

Dependency installation, components, actual data reads and browser/visual/accessibility proof
belong to subsequent Web entries. The existing WebGL chunk-size warning remains; no thresholds,
hooks or test expectations were weakened. No secret files, VPS, real source or provider calls,
external writes, push or deployment occurred. VPS-dependent entries remain owner-controlled.

### Ticket acceptance

Accepted entry 6.1 as done on 2026-10-12 after all verification and normal hooks passed, the four
reviewed files appeared in baseline-to-HEAD changes and the working copy was clean. Delivered in
`6da7ed1b7511e60a6e814c6487556ffdd5c17219` (`docs: define web routing data and component-test choices`).
The immutable intent SHA-256 remains
`ab79f5f82a8b8aeca06d57ce555d5f1ed0687f1559588384035ba5efc2176442`.
