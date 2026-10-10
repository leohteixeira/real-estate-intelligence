---
title: 'Context boundaries enforced'
type: 'feature'
ticket: '6'
created: '2026-10-10'
status: 'built'
baseline_revision: '20e4931069cf26a87e3ba8b684d7d1ef10ce52fc'
route: 'full'
route_source: 'pinned'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - 'specs/adrs/0011-bounded-contexts-and-module-layout.md'
warnings:
  - 'multiple-goals'
deferred: []
---

<intent-contract>

## Intent

**Problem:** The nine bounded contexts are documented but not enforced in source imports or
represented consistently in the API and worker composition roots, so later stories could
accidentally couple context internals or invent their module layout. Migration allocation is
documented but unchecked, while the existing deterministic price rule must remain owned by `market`.

**Approach:** Add root ESLint import zones with executable fixtures, create the missing Nest context
module shells and wire all nine into both applications, validate migration filenames against their
context blocks, and retain `pricePerSquareMeter` behind the `market/index.ts` public surface.

## Boundaries & Constraints

**Always:** Treat `properties`, `market`, `comparables`, `collection`, `locations`, `ask`, `alerts`,
`audit`, and `identity` as the complete context set; allow cross-context imports only through the
target context's `index.ts`; keep operational `shared`, persistence, health, and messaging modules
outside business contexts; preserve the existing audit endpoint and worker consumer; keep migration
numbering aligned with ADR 0011 and the checked-in README.

**Never:** Add a tenth context, context business behavior, cross-schema references, a per-package
ESLint configuration, a new lint plugin, provider connections in unit tests, or move shared
technical plumbing into a business context.

## I/O & Edge-Case Matrix

<!-- markdownlint-disable MD013 -->

| Scenario                     | Input / State                                                 | Expected Output / Behavior                                                         | Error Handling                                           |
| ---------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Forbidden context import     | A `properties` fixture imports a `market` implementation file | Root lint reports `no-restricted-imports`                                          | The lint convention check fails if ESLint accepts it     |
| Public context import        | The same fixture imports `market/index.ts`                    | Root lint accepts the import                                                       | The lint convention check fails on false positives       |
| Invalid migration allocation | A migration number and context name disagree                  | Convention validation rejects the filename before execution                        | The diagnostic names the file and expected context block |
| Application composition      | API and worker root modules are inspected                     | Each contains exactly the nine named context modules alongside operational modules | Tests identify missing or duplicate context modules      |

<!-- markdownlint-enable MD013 -->

</intent-contract>

## Code Map

- `eslint.config.js` -- generate one flat-config import zone per context; match context folders in
  every layer/application and reject another context's path beyond `index`.
- `test-fixtures/eslint/context-boundaries/` and `scripts/check-context-boundaries.mjs` -- lint
  invalid and allowed imports using virtual paths under `packages/domain/src/properties` without
  making the normal ESLint scan permanently red.
- `scripts/check-migration-conventions.mjs`, `package.json`, and `migrations/README.md` -- enforce
  the existing `NNNN_<context>_<description>.sql` table and retain the blocks already established by
  story 1.3.
- `apps/api/src/<context>/<context>.module.ts` and `apps/api/src/app.module.ts` -- add the eight
  missing context module shells and explicitly compose them with the existing functional
  `AuditModule`.
- `apps/worker/src/<context>/<context>.module.ts` and `apps/worker/src/worker.module.ts` -- add nine
  context modules; the audit module owns the existing `AuditTraceConsumer`, while other shells
  remain empty.
- `apps/api/src/app.module.test.ts` and `apps/worker/src/worker.module.test.ts` -- inspect Nest
  module metadata to prove the exact context set without opening PostgreSQL or RabbitMQ connections.
- `packages/domain/src/market/index.ts`, `packages/domain/src/index.ts`, and
  `packages/domain/src/market/price-per-square-meter.ts` -- already place and export the
  deterministic rule correctly; preserve this public surface and do not recreate it in `shared`.

## Tasks & Acceptance

**Execution:**

- [x] `eslint.config.js`, boundary fixtures, and checker script -- enforce public-barrel-only
      cross-context imports and prove both rejection and allowance.
- [x] API and worker context module files, roots, and tests -- represent all nine contexts
      explicitly while keeping current audit behavior within its context.
- [x] Migration convention checker and root scripts -- reject malformed names, unknown owners, and
      numbers outside the documented block before migration execution.
- [x] Existing `market` rule and migration documentation -- verify and preserve already-correct
      ownership, exports, naming, and allocation rather than duplicating prior work.

**Acceptance Criteria:**

- Given a source file inside any one of the nine contexts, when it imports another context below
  that context's `index.ts`, then `pnpm run lint` fails with the context-boundary rule while a
  barrel import remains valid.
- Given the API and worker composition roots, when their Nest metadata is tested and both
  applications are built, then each exposes exactly one module for every bounded context and the
  existing audit path remains wired.
- Given every checked-in SQL migration, when the root lint gate runs, then its four-digit number,
  context token, and allocated range agree with `migrations/README.md`.
- Given package exports, when type checking and tests run, then `pricePerSquareMeter` remains
  available through `market/index.ts` and the domain package root with unchanged behavior.

## Implementation Notes

- Added generated ESLint zones for every bounded context plus executable fixtures that prove
  implementation imports fail and public barrels pass.
- Added explicit API and worker context modules, moved the worker audit consumer under
  `AuditModule`, and verified the nine-module composition through Nest metadata tests.
- Added migration filename/range validation to the root lint gate, including an invalid allocation
  fixture that verifies the filename and expected block diagnostic.
- Preserved the existing market public surface and deterministic `pricePerSquareMeter`
  implementation without duplicating prior story work.
- Verified the complete stack with a fresh isolated Compose project. The integration runner required
  `INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-6` so its internal lifecycle commands targeted the
  same project.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 4 findings — high 0, medium 1, low 3, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Dynamic and type imports bypassed the context boundary.

    Verified with the reviewer's virtual-source cases; added `no-restricted-syntax` guards and
    executable forbidden/public-barrel fixtures for both syntaxes.

  - `[low]` `[patch]` The context regex rejected unrelated paths containing a context name —
    verified against `../vendor/market/internal.js` and `@vendor/audit/client`; narrowed matching to
    sibling-context paths and repository `@rei` context subpaths, with allowed regression fixtures.
  - `[low]` `[patch]` The executable migration allocation could drift from the README.

    Verified that the checker previously never read `migrations/README.md`; it now parses the
    documented table and asserts exact agreement with the executable map.

  - `[low]` `[patch]` Composition tests did not reject an additional module — verified that the
    former per-module loop ignored extra imports; API and worker tests now compare their complete
    operational-plus-context import lists.

## Design Notes

The context modules are composition seams, not artificial business layers. Existing audit providers
stay in `AuditModule`; the other modules remain empty until their owning stories add controllers,
consumers, or jobs. Boundary fixtures are linted through virtual source paths so the repository can
retain a deliberately invalid example while the normal lint command remains green only when ESLint
rejects it as expected.

## Verification

**Commands:**

- `pnpm run lint` -- boundary fixtures behave as expected and every migration filename matches its
  allocation.
- `pnpm run typecheck && pnpm run test && pnpm run test:coverage && pnpm run build` -- module
  composition, package exports, tests, coverage thresholds, and compilation pass.
- Isolated Compose verification:

  ```bash
  docker compose --project-name rei-story-1-6 up --build --detach --wait --wait-timeout 180 && \
    INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-6 pnpm run test:integration
  ```

  The isolated stack starts with the new API/worker module graphs and preserves the audit tracer.

- `docker compose --project-name rei-story-1-6 down --volumes --remove-orphans` -- the isolated
  verification stack and data are removed.
- `git diff --check` -- no whitespace errors are introduced.

## Auto Run Result

### Summary

Implemented enforceable boundaries for all nine business contexts. Cross-context static, dynamic,
and type imports may use only the target public barrel; API and worker roots explicitly compose
exactly the documented context modules; migration filenames and number allocations are checked
against the repository documentation; existing `market` ownership and audit behavior remain intact.

### Files Changed

- `eslint.config.js` — defines the context list and generated import zones.

  The zones target only repository context paths.

- `scripts/check-context-boundaries.mjs` and `test-fixtures/eslint/context-boundaries/` — exercise
  forbidden and allowed static, dynamic, type, and non-context paths.
- `scripts/check-migration-conventions.mjs`, `test-fixtures/migrations/`, and `package.json` —
  validate migration syntax, uniqueness, range ownership, negative diagnostics, and README agreement
  through the lint gate.
- `apps/api/src/app.module.ts`, `apps/api/src/<context>/`, and `apps/api/src/app.module.test.ts` —
  compose and verify the nine API contexts alongside operational modules.
- `apps/worker/src/worker.module.ts`, `apps/worker/src/<context>/`, and
  `apps/worker/src/worker.module.test.ts` — compose and verify the nine worker contexts, with the
  audit consumer owned by `AuditModule`.
- This plan — records implementation, review triage, verification, and completion evidence.

### Review Findings

- Patches applied: 4 total — medium 1, low 3. The fixes cover dynamic/type-import bypasses, path
  false positives, README allocation drift, and exact composition assertions.
- Items deferred: 0.
- Findings rejected: 0.
- Follow-up review recommendation: false. The single medium patch and three low patches were
  directly covered by focused regression checks and the full verification suite; the first-pass
  threshold for another review was not reached.

### Verification Performed

- `pnpm run lint` — passed.

  This includes every boundary fixture and migration convention/README check.

- `pnpm run typecheck` — passed across all eight workspace projects.
- `pnpm run test` — passed: 277 tests across 44 test files.
- `pnpm run test:coverage` — passed every configured threshold.

  API remained at 100% statements and worker at 94.25%.

- `pnpm run build` — passed for all eight workspace projects; Vite emitted only its existing
  chunk-size advisory.
- Focused API and worker composition tests — passed independently after review patches.
- Fresh `rei-story-1-6` Compose build and health wait — passed.

  PostgreSQL, RabbitMQ, MinIO, API, worker, web, and AI services were healthy.

- `INTEGRATION_COMPOSE_PROJECT_NAME=rei-story-1-6 pnpm run test:integration` — passed the audit
  delivery guarantees integration.
- Compose teardown with volumes and orphan removal — passed;
  `docker compose --project-name rei-story-1-6 ps -a` is empty.
- `git diff --check` — passed.

### Residual Risks

No known residual defect remains within the story scope. The boundary gate is intentionally static:
a non-literal runtime-computed module specifier cannot be mapped to a bounded context by ESLint and
remains subject to code review.
