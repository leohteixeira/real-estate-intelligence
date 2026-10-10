---
title: 'ADR for Zero Data Retention on every route'
type: 'chore'
ticket: '9'
created: '2026-10-10'
status: done
baseline_revision: 'f027b305fec76669567e9d02a0c05acb80a46234'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - 'specs/adrs/0009-ai-provider-resilience-policies.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** ADR 0009 requires Zero Data Retention for gateway calls but does not record the full
cross-route invariant required by B10: every model route receiving user text must prove ZDR, fail
closed when it cannot, and keep the primary model behind the gateway until a direct route proves an
equivalent guarantee.

**Approach:** Add an Accepted ADR extending ADR 0009 that defines the scope, request-level evidence,
fail-closed and fallback rules, and gateway-first primary route; index it and record the agent's
owner-delegated decision in the platform epic Notes.

</intent-contract>

## Implementation Notes

The automatic route is oneshot because this is a localized documentation decision expected to
touch three repository files and remain below 100 modified lines. Decision D-001 records the HITL
choice in the external append-only decision log.

The implementation adds ADR 0014, indexes it in `specs/README.md` and records the delegated
decision in the platform epic Notes. The ADR makes route eligibility a pre-transmission check so a
missing ZDR guarantee cannot be discovered only after user text has already left the process.

The repository's markdownlint configuration adds `**/*.md` to normal invocations. Verification
uses `--no-globs` so the story check covers its changed Markdown instead of immutable BMad render
snapshots; the commit hook still checks the staged Markdown after those transient snapshots are
removed.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` ADR 0014 was absent from the canonical SPEC companion list — added the
    ADR path so preservation validation and contract consumers include the new normative decision.
  - `[medium]` `[patch]` The architecture register omitted ADR 0014 and still listed its decision as
    awaiting an ADR — registered ADR 0014 and removed the stale pending-decision row.
  - `[medium]` `[patch]` The no-eligible-route rule could be read as disabling ADR 0008's local Jev
    fallback — scoped explicit failure to calls without a non-transmitting fallback and explicitly
    preserved Jev degradation to the deterministic heuristic.

### 2026-10-10 — Follow-up review pass

- verdicts: 4 findings — high 0, medium 4, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` The fallback-test rule still required a policy failure whenever no eligible
    external route remained — scoped it to calls without a permitted local fallback and separately
    required the Jev heuristic case.
  - `[medium]` `[patch]` The capability map omitted ADR 0014 from CAP-10 and CAP-15 — added the ADR
    to both governing-decision entries.
  - `[medium]` `[patch]` The rendered architecture HTML still omitted ADR 0014 and listed its
    decision as owed — updated its status text and accepted-ADR table and removed the stale gap.
  - `[medium]` `[patch]` ADR 0014 used a status value outside ADR 0001's permitted lowercase set —
    changed `Accepted` to `accepted` to match the normative convention and every existing ADR.

## Verification

**Commands:**

```sh
pnpm exec prettier --check \
  specs/README.md \
  specs/adrs/0014-zero-data-retention-for-user-text-routes.md \
  _bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/epic-platform-baseline.md \
  _bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-adr-for-zero-data-retention-on-every-route-plan.md \
  _bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md \
  _bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md \
  docs/architecture/architecture.html
pnpm exec markdownlint-cli2 --no-globs \
  :specs/README.md \
  :specs/adrs/0014-zero-data-retention-for-user-text-routes.md \
  :_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/epic-platform-baseline.md \
  :_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-adr-for-zero-data-retention-on-every-route-plan.md \
  :_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md \
  :_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
```

Expected: formatting and Markdown lint report no errors, then the complete repository quality gate
passes.

## Auto Run Result

### Summary

Accepted ADR 0014 extends ADR 0009 with a pre-transmission, machine-verifiable Zero Data Retention
policy for every external model route that receives user text. The decision keeps the primary model
behind Vercel AI Gateway until a direct route proves equivalent protection, preserves the local Jev
heuristic and fails closed without weaker external fallback.

### Files changed

- `specs/adrs/0014-zero-data-retention-for-user-text-routes.md` — records the accepted ZDR scope,
  evidence, routing, fallback, testing and observability rules.
- `specs/README.md` — indexes ADR 0014.
- `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`
  — includes ADR 0014 in the canonical preservation-validated companion set.
- `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md` —
  registers ADR 0014, removes the fulfilled pending decision and maps it to CAP-10 and CAP-15.
- `docs/architecture/architecture.html` — synchronizes the rendered accepted-ADR register and
  removes the fulfilled ZDR gap.
- `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/epic-platform-baseline.md`
  — records the agent's owner-delegated decision in the epic Notes.
- `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-adr-for-zero-data-retention-on-every-route-plan.md`
  — records implementation, review triage and verification evidence.

### Review findings

- First-pass patches: two medium entries covering three findings. One entry propagated ADR 0014
  into both canonical contract registries; the other removed ambiguity between fail-closed
  generative calls and ADR 0008's non-transmitting Jev heuristic.
- Follow-up patches: three medium entries covering four findings. They aligned the fallback-test
  rule, mapped ADR 0014 to CAP-10 and CAP-15, synchronized the rendered architecture, and normalized
  the ADR status to ADR 0001's permitted value.
- Deferred: none.
- Rejected: none.
- Follow-up patched counts by entry verdict: high 0, medium 3, low 0.

### Follow-up review recommendation

`false`. The follow-up pass patched no high entries, so the work has converged under the workflow's
follow-up rule.

### Verification performed

- Prettier check passed for all six changed Markdown files and the rendered architecture HTML.
- Markdownlint passed for all six changed Markdown files with zero errors.
- `pnpm run lint` passed.
- `pnpm run typecheck` passed for all eight workspace projects in scope.
- `pnpm run test` passed: domain 11, web 14, infrastructure 3, API 7 and worker 5 tests; projects
  configured without tests exited successfully.
- `pnpm run build` passed for all eight workspace projects in scope.

### Residual risks

The web build retains its pre-existing Vite warning for the 536.96 kB `CityScene` chunk. It does not
affect this documentation-only story. No review risk remains open after the follow-up pass.
