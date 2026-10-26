---
title: 'Refactor sweep'
type: 'chore'
ticket: '14'
created: '2026-10-26'
status: 'built'
baseline_revision: 'cae417695beb641d5d0af39ac8846b9d5cb610d2'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 6 requires closure or ticketing of its deferred findings and a passing full
check before the final goal campaign. Its completed plans must retain their original evidence.

**Approach:** Reconcile the existing deferred lists and the explicitly postponed Ask stream
sharing against their current implementations. Close only actual residual work; do not open
another general audit or manufacture a refactor when later stories already completed it.

</intent-contract>

## Implementation Notes

Oneshot: documentation-only reconciliation below 100 changed lines; no product or test changes.
At story start, all 15 other epic-web plans have exactly one empty `deferred: []` list.
A scoped search of their review narratives contains no outstanding deferred finding. Historical
routing deferral is closed by accepted ADR 0028/story 6.1; temporary formatting deferral in the
Property campaign is closed by its final formatted/committed acceptance.

Story 6.9's explicit future stream sharing is already complete: `ask/ask-client.ts` and
`headless/ask-client.ts` both use `ask/ask-transport.ts` (`createAskTransport` and
`askTransportPolicy`), and their sessions use `ask/ask-stream.ts`'s shared admission policy.
Commits `e198fe9` and `3cefc1b` delivered the shared mechanism. Prepared/live session contracts
remain distinct because their response types and authority differ; no duplicate transport
extraction remains. No new abstraction, cleanup, dependency or backlog ticket is warranted.

Scope: this plan and a concise existing epic acceptance entry. Preserve every previous plan,
review round, product invariant and delivery identity. Final published campaign follows separately.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Quick review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0.
- Independent context-free inspection returns `[]`. No patch, deferral or rejection.

## Verification

- Inspect the 15 predecessor frontmatters and scoped deferred/review references; expect zero
  unresolved findings. Inspect shared Ask transport/session imports; expect the existing shared
  implementation above, without changing prepared/live business semantics.
- Reuse the final 6.13 full checks on unchanged source/dependencies: repository lint/boundaries/
  migrations, strict eight-workspace and integration typecheck, all workspace unit results,
  affected AI 356/web 634 coverage tests, unchanged backend/integration receipts and serial
  eight-workspace build. Exact logs and limits remain in story 6.13 and the deployment guide.
  Subsequent changes are standalone evidence executors or documentation, not product bytes.
- Reuse 6.11's independently gated landing release and 12-case public presentation review.
  No rebuild, product test repetition or provider call is justified by these Markdown changes.
- Run normal Markdown/secret/commit gates, inspect the final diff, obtain one independent Quick
  review, commit, mark done and verify the ticket ordering. No broader review reset.

## Auto Run Result

Closed the existing refactor obligation by reconciling all 15 predecessor plans and the
already shared Ask transport/stream policy. This plan records scope and proof; `epic-web.md`
records the same concise delivery boundary. No application, executor or dependency changes.

Review patches: high/medium/low 0/0/0; deferred 0; rejected 0. Follow-up recommendation false:
no changed runtime behavior or unresolved finding remains. Scoped inspection and unchanged
full gates cited above satisfy verification; normal commit hooks verify these Markdown files.
No residual sweep work needs a ticket. Final published E2E remains required for the goal and
is not claimed by this story. No rebuild, model call, PR, merge or remote CI was performed.
