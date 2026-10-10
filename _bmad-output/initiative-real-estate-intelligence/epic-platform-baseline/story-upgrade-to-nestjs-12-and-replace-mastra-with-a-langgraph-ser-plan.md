---
title: 'Upgrade to NestJS 12 and replace Mastra with a LangGraph service skeleton'
type: 'feature'
ticket: '1'
created: '2026-10-10'
status: done
baseline_revision: 'b66830c1b83d1e2b82fb19a10840a9be466fd2a3'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
  - 'quick'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - 'specs/adrs/0007-nestjs-and-langgraph-runtime-boundary.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** API and worker still use NestJS 11, while `apps/ai` relies on Mastra for its runtime
and deployment bundle. This contradicts the accepted runtime boundary and leaves no Nest-owned AI
health or LangGraph seam for later run stories.

**Approach:** Move all three backend applications to a coherent NestJS 12 toolchain, replace the AI
runtime with an isolated Nest HTTP service containing a compiled no-op LangGraph graph, and replace
the Mastra bundle image with the repository's ordinary pnpm build/deploy path without changing API
or worker behavior.

## Boundaries & Constraints

**Always:** Keep API `/health`, `/ready`, `/api/v1`, database behavior and OpenTelemetry preload;
keep the worker as a non-HTTP standalone Nest context; bind AI to `0.0.0.0:4111`; keep AI free of
database, broker and object-storage credentials and `@rei/infrastructure`; use exact compatible
NestJS 12, TypeScript 6 and LangGraph dependencies through pnpm; keep provider-key checks opt-in.

**Never:** Add agents, models, tools, checkpoints, business endpoints or telemetry to AI; give the
AI service direct infrastructure access; add an HTTP server to the worker; rewrite historical ADRs;
use `npm`; read ignored environment files; alter unrelated product behavior.

## I/O & Edge-Case Matrix

| Scenario          | Input / State                  | Expected Output / Behavior                              | Error Handling                     |
| ----------------- | ------------------------------ | ------------------------------------------------------- | ---------------------------------- |
| AI liveness       | `GET /health`                  | `200` with `{ "status": "healthy" }`                    | Touches no dependency              |
| AI port           | Missing or valid `AI_PORT`     | Listens on 4111 or requested valid port                 | Invalid port fails startup clearly |
| Empty graph       | Empty state invocation         | Compiled graph terminates without I/O                   | No provider or network fallback    |
| Existing services | API and worker under NestJS 12 | Existing routes, heartbeat and shutdown behavior remain | Existing typed failures remain     |

</intent-contract>

## Code Map

- `apps/api/package.json`, `apps/worker/package.json` -- align framework/config dependencies while
  preserving their current source and scripts.
- `apps/ai/package.json`, `apps/ai/src/`, `apps/ai/tsconfig*.json`, `apps/ai/nest-cli.json` -- replace
  the Mastra entry with emitted Nest code, config, health and a DI-provided no-op graph.
- `docker/ai.Dockerfile`, `compose.yaml` -- deploy and run the AI Nest artifact on port 4111 while
  preserving its credential boundary.
- `package.json`, `apps/*/package.json`, `packages/*/package.json`, `pnpm-lock.yaml` -- keep the
  workspace on one TypeScript 6 compiler and lock the compatible Nest/LangGraph graph.
- `.gitignore`, `eslint.config.js`, `pnpm-workspace.yaml` -- remove Mastra-only paths and extend the
  existing Nest lint convention to AI without removing build allowances still used by Vite.
- `README.md`, `apps/ai/README.md`,
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`
  -- make current-state and operator documentation truthful after migration.
- `specs/adrs/0016-typescript-6-toolchain.md`, `specs/README.md` -- record the TypeScript 6 toolchain
  decision, preserve the still-valid frontend choices from ADR 0006, and supersede that accepted
  record before the compiler pin changes.
- `docs/architecture/architecture.html` -- synchronize the linked visual architecture's stack,
  current-state callout and decision table with the implemented runtime and ADR 0016.

## Tasks & Acceptance

**Execution:**

- [x] `package.json`, `apps/*/package.json`, `packages/*/package.json`, `pnpm-lock.yaml` -- pin
      compatible NestJS 12, TypeScript 6, LangGraph/core and Zod versions; remove the full Mastra
      dependency graph.
- [x] `apps/ai/src/`, `apps/ai/nest-cli.json`, `apps/ai/tsconfig*.json` -- implement bootstrap,
      validated port, dependency-free health module and one compiled no-op graph provider; add focused
      config, health and graph tests.
- [x] `docker/ai.Dockerfile`, `compose.yaml` -- build with `nest build`, deploy with pnpm, run
      `dist/main.js`, expose 4111 and preserve the restricted environment.
- [x] `.gitignore`, `eslint.config.js`, `pnpm-workspace.yaml` -- delete obsolete Mastra conventions
      and retain the workspace's remaining tooling needs.
- [x] `README.md`, `apps/ai/README.md`,
      `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`
      -- document NestJS 12, LangGraph, commands, boundary and health behavior without rewriting
      historical decision rationale.
- [x] `specs/adrs/0016-typescript-6-toolchain.md`, `specs/README.md`,
      `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`
      -- accept a new TypeScript 6 toolchain ADR that supersedes ADR 0006 while retaining its other
      frontend/tooling choices, mark ADR 0006's status as superseded without rewriting its rationale,
      and update the ADR indexes.
- [x] `docs/architecture/architecture.html` -- replace the obsolete TypeScript 5.9, NestJS 11 and
      Mastra current-state claims and show ADR 0006 as superseded by accepted ADR 0016.

**Acceptance Criteria:**

- Given a frozen pnpm install, when the complete quality gate runs, then every workspace project
  lints, type-checks, tests and builds with NestJS 12 and the coherent TypeScript compiler.
- Given the built Compose stack, when its public surfaces are probed, then web responds, API
  `/health` and `/ready` respond as before, AI `/health` returns healthy, and worker remains running
  as a standalone context.
- Given dependency and source inspection, when Mastra is queried, then no installed dependency,
  executable script, generated bundle path or runtime source remains; historical ADR text is kept.
- Given the AI container configuration, when inspected and started, then it receives no database,
  broker or object-storage credentials and the no-op graph performs no external I/O.

## Implementation Notes

KEEP: Preserve the verified NestJS 12 dependency set, TypeScript 6.0.3 compiler alignment,
dependency-free AI health route, validated `AI_PORT`, DI-provided no-op LangGraph graph, worker
standalone lifecycle, AI container credential boundary, focused API/worker/AI tests, documentation
updates already named by the original plan, and the successful frozen-install/full-gate/Compose
verification behavior when re-deriving the implementation.

## Plan Change Log

### 2026-10-10 — Review repair 1

- Trigger: the first review found that the TypeScript 6 migration contradicted accepted ADR 0006
  and that the linked visual architecture still described TypeScript 5.9, NestJS 11 and Mastra.
- Amendment: added ADR 0016 plus ADR-index synchronization and explicit visual-architecture updates
  to the code map and execution tasks, including the ADR-process requirement to mark ADR 0006's
  status as superseded without rewriting its rationale; the intent contract remains unchanged.
- Known-bad state avoided: code and operator documentation must not claim the new runtime/compiler
  while the normative decision record and linked HTML still claim the old stack.
- KEEP: retain every implementation and verification behavior listed under Implementation Notes.

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` TypeScript 6 contradicted accepted ADR 0006 — ADR 0001 forbids editing
    accepted records and requires a superseding ADR; the plan now requires ADR 0016 and synchronized
    decision indexes before the compiler pin changes.
  - `[medium]` `[bad_plan]` The linked visual architecture still claimed TypeScript 5.9, NestJS 11
    and Mastra — the source architecture calls the HTML an equivalent rendering, so the plan now
    explicitly requires synchronizing its stack, current-state callout and ADR table.

### 2026-10-10 — Review pass 2

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none

## Design Notes

The empty graph is a real compiled `StateGraph` with one no-op node from `START` to `END`. “Empty”
means no agent, model, tool, checkpoint or infrastructure adapter; this gives later stories a tested
DI seam without inventing behavior. NestJS 12 may remain CommonJS on Node 24.19, matching the
official migration path and avoiding an unrelated module-format conversion.

## Verification

**Commands:**

- `pnpm install --frozen-lockfile` -- lockfile and exact peers install without changes.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` -- full quality gate.
- `pnpm why mastra && pnpm why @mastra/core` -- neither query finds an installed package.
- `docker compose build api worker ai web && docker compose up -d` -- all four application images
  build and start with PostgreSQL.
- HTTP probes for web `/`, API `/health` and `/ready`, and AI `/health` -- expected status and JSON;
  `docker compose ps` shows the worker running.
- `docker compose down` -- services stop cleanly after the smoke test.

## Auto Run Result

### Summary

API and worker now use NestJS 12, and `apps/ai` is an isolated NestJS 12 service with validated
startup configuration, dependency-free health, and a DI-provided no-op LangGraph graph. Mastra and
its bundle path are removed. The full workspace uses TypeScript 6.0.3 under accepted ADR 0016, with
ADR 0006 marked superseded and both architecture representations synchronized.

### Files changed

- Workspace manifests, `pnpm-lock.yaml` and `tsconfig.base.json` -- align NestJS 12, TypeScript 6,
  LangGraph and compatible build tooling across all workspaces.
- `apps/ai/` -- replace the Mastra runtime with Nest bootstrap, configuration, liveness, graph
  composition, emitted build configuration and operator documentation.
- `apps/api/src/health/health.controller.test.ts` and `apps/worker/src/heartbeat.job.test.ts` --
  protect existing API health/readiness and worker scheduling behavior during the framework upgrade.
- `docker/ai.Dockerfile` and `compose.yaml` -- deploy the built AI service while retaining its
  database, broker and object-storage credential boundary.
- `.gitignore`, `eslint.config.js` and `pnpm-workspace.yaml` -- remove obsolete Mastra conventions
  and retain the tooling rules still used by Vite and Nest.
- `specs/adrs/0006-frontend-toolchain.md`, `specs/adrs/0016-typescript-6-toolchain.md` and
  `specs/README.md` -- supersede the old compiler decision without rewriting its rationale and
  record the retained frontend/tooling choices.
- `README.md`, `apps/web/PRODUCT.md`, the source architecture and
  `docs/architecture/architecture.html` -- describe the implemented runtime, compiler and health
  surfaces consistently.

### Review findings

- First pass: two medium `bad_plan` findings. The plan was repaired to require ADR 0016, the ADR
  status/index updates and synchronization of the linked HTML architecture; the implementation was
  reverted and re-derived from that amended plan.
- Parent audit: marked ADR 0006 as superseded, as required by ADR 0001, while preserving its
  historical decision text.
- Second pass: no findings.
- Patches applied in the review-patch category: high 0, medium 0, low 0.
- Deferred items: none. Rejected findings: none.
- Follow-up review recommendation: false; the repaired plan converged with no second-pass findings.

### Verification performed

- `pnpm install --frozen-lockfile` passed without lockfile changes.
- `pnpm run lint`, `pnpm run typecheck`, `pnpm run test` and `pnpm run build` passed; 53 tests ran.
- `pnpm why mastra` and `pnpm why @mastra/core` returned no installed dependency.
- All four matrix rows are covered by passing AI configuration/health/graph tests, API health and
  readiness tests, worker heartbeat tests, and the Compose smoke test.
- `docker compose build api worker ai web` and `docker compose up -d` passed. Web returned 200, API
  returned healthy/ready, AI returned healthy, and the worker ran without an HTTP port.
- AI container environment inspection found no database, broker or object-storage credential.
- `docker compose down` removed the stack cleanly.

### Residual risks

- Vite retains the pre-existing warning for the 536.96 kB `CityScene` chunk.
- Legacy pnpm deploy emits non-fatal warnings for dev-only executable links; the production image
  builds and the runtime health probe succeeds.
