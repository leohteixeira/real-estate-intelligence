---
title: 'Collection refactor sweep'
type: 'chore'
ticket: '13'
created: '2026-10-26'
status: done
baseline_revision: '07dda57005b15400587093af8c925c9d7c8f08e5'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nine historical deferrals in the collection plans need a current disposition;
two still describe production authorization as unavailable despite Story 2.12's acceptance.

**Approach:** Reconcile each recorded deferral against its completed owning story, retaining
original history and evidence. Track the remaining actor-aware operator audit in the existing
Sign-in and protected operations epic ticket, which already owns identity and audit completion.
Do not reopen completed implementation or start a general audit.

</intent-contract>

## Implementation Notes

- Oneshot: zero runtime or test code lines; six mechanically related Markdown files.
- Read the collection epic and its recorded deferrals, the source-enable service and its existing
  design notes, and the future identity/operations epic. Eight deferrals are covered by completed
  Stories 2.5, 2.6, 2.7, 2.14 and 2.12. The ninth requires future authenticated actor identity;
  `enabled_at` alone is not a durable actor audit.
- Update the three originating plans with dispositions, the collection epic with closure, and
  the existing identity/operations epic with explicit ownership. Preserve append-only lists.
- Acceptance: all nine entries have an explicit completed owner or existing future ticket;
  runtime, dependencies and original receipts remain unchanged; applicable checks pass.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Restricted Quick review

- Verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0.
- Independent inspection returned no findings. No patches, new deferrals or rejected findings.

## Verification

- Inspect all nine originating entries and their reconciliation against completed owning plans.
- Confirm unchanged delivered product code and dependencies:

  ```sh
  git diff --quiet b570a09427bea39ea03d4dda93c7dc0e0c502899 -- \
    apps packages migrations docker pnpm-lock.yaml package.json tsconfig.integration.json
  ```

- Reuse the full passing 3282-test gate at `37edd6ce638f4f94faff21446d7c12640fc6922e`,
  followed by Story 2.12's final lint, strict typecheck, build, 567 infrastructure and 256 worker
  coverage tests for its changed dependency slice. Production seed, replay, native scheduled run
  and Tempo receipts remain in Story 2.12. Documentation does not require another product run.
- Run scoped Prettier, Markdown lint, `git diff --check` and normal commit hooks.
- Required independent Quick review inspects only this reconciliation and its evidence references.

## Auto Run Result

Reconciled the nine retained deferrals in the three originating collection plans; eight point
at completed owning stories and the actor-aware audit item points at the existing future
identity/operations epic ticket. Updated both epic tickets and this plan: six Markdown files,
zero runtime changes. Original append-only lists and production receipts were preserved.

Prettier, Markdown lint, `git diff --check` and the unchanged delivered-code comparison passed.
The full gate and final affected-slice checks listed above remain valid; no product campaign
was repeated for documentation. Independent Quick review: no findings, zero patches or new
items deferred. Follow-up review recommended: false. Actor-aware source-enable audit remains
future identity/operations work; this sweep does not claim it was implemented.

Commit verification note: the normal Markdown hook caught an overlong inline command in this
plan. Rendered it as a wrapped shell block; hooks remain enabled. The earlier direct lint call
had not supplied a completed result, so its output was not sufficient proof of success.
