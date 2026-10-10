---
title: 'Instruction files corrected'
type: 'chore'
ticket: '11'
created: '2026-10-10'
status: 'built'
baseline_revision: 'f47aaaedfc726451aaf5e542fe77ec29c15c2791'
route: 'oneshot'
route_source: 'auto'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md'
  - 'specs/adrs/0007-nestjs-and-langgraph-runtime-boundary.md'
warnings: []
deferred:
  - summary: >-
      The instruction files no longer document the temporary AI bundle exception that the current
      production image still needs before the runtime migration.
    evidence: |-
      apps/ai/package.json still defines the AI bundle command and docker/ai.Dockerfile still runs
      it. ADR 0007 removes that path only when the runtime is migrated, so the unconditional pnpm
      rule is ahead of the current implementation. The next runtime-migration story is expected to
      remove the exception's underlying command.
    location: >-
      AGENTS.md:73 and CLAUDE.md:73
    severity: medium
  - summary: >-
      The workspace AGENTS.md retains the obsolete Real Estate Intelligence guidance that this
      story removes from the three instruction files named by B11.
    evidence: |-
      /workspace/AGENTS.md still names NestJS 11, Mastra, product specifications under specs/ and
      the old port row. It is outside the story's explicit three-file intent and outside the product
      repository, but remains conflicting guidance for AGENTS consumers.
    location: >-
      /workspace/AGENTS.md
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The workspace and repository instruction files still direct agents to NestJS 11,
Mastra and the old product-specification location, while the workspace port table omits the product's
RabbitMQ ports. Those instructions conflict with the accepted architecture before the first code
story starts.

**Approach:** Align the three named instruction files with ADR 0007 and the canonical SPEC: NestJS
12 with a separate LangChain/LangGraph AI application, product specifications under
`_bmad-output/`, ADRs under `specs/adrs/`, and RabbitMQ 5672/15672 in the workspace port table.

</intent-contract>

## Implementation Notes

This is a low-risk, mechanical documentation correction across three instruction files, estimated
well below 100 modified lines, so the automatic route is oneshot. Preserve all unrelated workspace
and repository rules. `/workspace/CLAUDE.md` belongs to the meta-workspace rather than this Git
repository, so it is verified here but cannot be included in the repository commit.

Implementation updated the workspace stack, AI-boundary, artifact-location and port guidance, then
kept the repository `AGENTS.md` and `CLAUDE.md` byte-for-byte aligned with the NestJS 12,
LangChain/LangGraph and BMad artifact rules. The obsolete bundle-script exception was replaced by
the repository-wide pnpm-only rule; no application code or runtime manifest changed.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 3 findings — high 0, medium 2, low 1, false 0, maybe-false 0
- findings:
  - `[medium]` `[defer]` The unconditional pnpm-only rule removed the existing AI bundle exception
    before the runtime migration removes the bundle command — `apps/ai/package.json` and
    `docker/ai.Dockerfile` prove the exception is still needed, but the required fix edits agent
    context and is therefore deferred under the review workflow.
  - `[medium]` `[defer]` `/workspace/AGENTS.md` still carries the obsolete runtime, artifact and
    port guidance — the conflict is real but pre-existing, outside the three files named by B11 and
    outside the product repository, so it is recorded for later workspace-level reconciliation.
  - `[low]` `[reject]` The plan's shell block can mask an earlier assertion failure because it does
    not enable fail-fast execution — the review workflow forbids fixing a finding by editing this
    build's plan; the assertions were rerun separately under `set -euo pipefail` and passed.

## Verification

**Commands:**

```sh
pnpm exec prettier --check \
  /workspace/CLAUDE.md \
  AGENTS.md \
  CLAUDE.md \
  _bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-instruction-files-corrected-plan.md
pnpm exec markdownlint-cli2 --no-globs \
  :/workspace/CLAUDE.md \
  :AGENTS.md \
  :CLAUDE.md \
  :_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-instruction-files-corrected-plan.md
for instruction_file in /workspace/CLAUDE.md AGENTS.md CLAUDE.md; do
  grep -Fq 'NestJS 12' "$instruction_file"
  grep -Fq 'LangGraph' "$instruction_file"
  grep -Fq '_bmad-output/' "$instruction_file"
  ! grep -Eq 'NestJS 11|Mastra' "$instruction_file"
done
grep -Fq 'RabbitMQ 5672/15672' /workspace/CLAUDE.md
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
```

Expected: formatting and Markdown lint pass; each named instruction file describes NestJS 12,
LangGraph and `_bmad-output/` without naming NestJS 11 or Mastra; the workspace table lists both
RabbitMQ ports; and the complete repository quality gate passes.

## Auto Run Result

### Summary

Aligned the three B11 instruction files with the accepted platform direction: NestJS 12,
LangChain/LangGraph, BMad product specifications under `_bmad-output/`, ADRs under `specs/adrs/`
and RabbitMQ on ports 5672 and 15672. The repository instruction files remain byte-for-byte
identical, and no application code or manifest changed.

### Files changed

- `/workspace/CLAUDE.md` — updates the workspace stack, AI boundary, artifact location and Real
  Estate Intelligence port row; this meta-workspace file is outside the product Git repository.
- `AGENTS.md` — updates the repository runtime, AI boundary, artifact and pnpm guidance.
- `CLAUDE.md` — mirrors the corrected repository guidance exactly.
- `_bmad-output/initiative-real-estate-intelligence/epic-platform-baseline/story-instruction-files-corrected-plan.md`
  — records the intent, implementation, verification and review evidence.

### Review findings

- Patches: none.
- Deferred: two medium entries — the temporary current-runtime bundle exception and the stale
  workspace `AGENTS.md` outside B11's explicit file set.
- Rejected: one low plan-verification finding, because the workflow forbids fixing a finding by
  editing the reviewed plan; a separate fail-fast run proved every assertion.
- Patched counts by entry verdict: high 0, medium 0, low 0.

### Follow-up review recommendation

`false`. No review entry was patched, so the workflow does not require a follow-up pass.

### Verification performed

- Prettier check passed for the three instruction files and the story plan.
- Markdownlint passed for all four Markdown files with zero errors.
- Fail-fast assertions confirmed that all three named files contain NestJS 12, LangGraph and
  `_bmad-output/`, contain neither NestJS 11 nor Mastra, and that the workspace port table lists
  RabbitMQ 5672/15672.
- `pnpm run lint` passed.
- `pnpm run typecheck` passed for all eight workspace projects in scope.
- `pnpm run test` passed: domain 11, web 14, infrastructure 3, API 7 and worker 5 tests; projects
  configured without tests exited successfully.
- `pnpm run build` passed for all eight workspace projects in scope.

### Residual risks

The two deferred instruction inconsistencies remain explicit above. The current web build also
retains its pre-existing Vite warning for the 536.96 kB `CityScene` chunk; neither condition changes
the documentation-only story's runtime behavior.
