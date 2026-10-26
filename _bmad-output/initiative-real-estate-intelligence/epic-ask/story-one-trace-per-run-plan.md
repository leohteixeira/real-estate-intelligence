---
title: 'One trace per run'
type: 'feature'
ticket: '14'
created: '2026-10-26'
status: done
baseline_revision: '1ec5594111778014472b0cf7d4560dbc97ef7019'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/specs/adrs/0027-receipt-bound-model-explanations.md
  - /workspace/repos/real-estate-intelligence/docs/testing/integration.md
  - /home/vscode/.codex/skills/nestjs-modular-monolith/SKILL.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-18 requires one exported trace across decision, tool and generation,
but current modes separate those steps and existing campaigns disable export. Missing
spans/attributes and automatic SQL-error/HTTP-URL fields prevent complete private evidence.

**Approach:** Apply D-102's compatible combined mode using existing decision and explanation
capabilities. Complete only required instrumentation and export privacy, then prove the actual
API/broker/worker/AI path with synthetic providers and an owned trace capture fixture.

## Boundaries & Constraints

**Always:** Add `routed-text-explanation-v1` with graph `intent-price-explanation-v1`;
preserve every historical discriminator, checkpoint partition, document byte and replay rule.
Reuse retained decision/confirmation, deterministic extraction/tool, immutable receipt and
existing conservative model reservations/accepted-explanation recovery. Generation follows only
an authorized executable price result and verifies ZDR. Traces record real work and categorical
outcomes; absent provider usage/cost is explicitly unavailable. Preserve W3C/outbox parenting,
SDK payload telemetry off, original deadlines, policy order and cancellation fences.

**Never:** Rewrite migrations/history, invent spans/results/cost, reset budgets on reclaim,
loosen confirmation/privacy/fidelity, introduce another execution engine or queue, expose AI to
infrastructure credentials, read `.env*`, contact live providers or alter production services.
One heavy operation at a time on the shared VPS; do not repeat unchanged campaigns.

## I/O & Edge-Case Matrix

| Scenario         | Input / State                                             | Expected Output / Behavior                                                       | Error Handling                        |
| ---------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------- |
| Combined price   | Clear PT/EN request with fake private providers           | Retained decision, exact price and receipt-bound explanation; one exported trace | No invented result                    |
| Confirmation     | Low confidence, persisted pause and explicit confirmation | Same decision/run lineage, validated operands and one completed chain            | Refusal/expiry/cancel preserve fences |
| Recovery         | Accepted explanation before lost saver/terminal ACK       | Reuse evidence and budget on reclaim, no extra generation                        | Stale writes refused                  |
| Unavailable      | Recognized non-executable intent                          | Typed unavailable terminal, null explanation, no generation span/call            | No improvised response                |
| Export privacy   | Provider/query/credential/SQL fault sentinels             | Whole exported trace excludes sensitive text in every field                      | Sanitized categorical failure         |
| Historical state | Populated old modes/partitions before migration           | Same bytes, authority and recovery semantics                                     | Wrong partition/version rejected      |

</intent-contract>

## Code Map

- Architecture `Natural-language runs` defines the combined first vertical flow and
  observability attributes (lines 537–549). D-102 is recorded in the owner ledger and epic Notes.
  D-012/ADR 0020 override Nest's Prisma/NX/Jest examples; use existing SQL/ports/Vitest.
- `packages/domain/src/ask/{ask-live.types,intent-decision.types,graph-checkpoint.types}.ts`,
  `packages/contracts/src/ask/{ask-live.dto,intent-decision.dto,run-execution.dto,graph-checkpoint.dto}.ts`:
  add closed new mode/basis/evidence branches. Price completion requires decision receipt,
  tool receipt and explanation; other new-mode states keep explanation null. Preserve old tuples.
- `apps/api/src/ask/ask-live.controller.ts`,
  `packages/application/src/ask/{ask-run.service,ask-live.facade,ask-run.repository}.ts`:
  explicit new admission through existing routed extraction/commands; retain historical commands.
- `apps/ai/src/graph/{intent-routing.graph,explained-price.graph,price-graph.factory,remote-checkpoint-saver}.ts`,
  `apps/ai/src/execution/execution.service.ts`: factory already receives decider and explainer.
  New graph runs typedDecision -> confidenceGate -> executeIntent, then modelExplanation only
  for price. Reuse the existing model-node receipt-rebind checks, not a generic workflow layer.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts`: extend exact routed authority,
  claim, decision, tool, confirm/cancel/expiry and completion branches; reuse explained completion's
  authoritative model row, equality/fidelity checks and atomic terminal/event/outbox/inbox commit.
  `model-explanation.pg-repository.ts` admits only the new explained basis in addition to old.
  `graph-checkpoint.pg-repository.ts` binds the new retained basis to its exact partition.
- `migrations/6005_*.sql` through `6007_*.sql` are read-only references. New `6008_*.sql` extends
  explanation/document/history/routed/event/checkpoint constraints and model attempt/explanation
  fences additively. Preserve old validators; a new validator may normalize only for validation,
  never stored JSON. No new provider protocol, event payload version or model tables are needed.
- `apps/ai/src/graph/price-telemetry.ts`, `models/model-telemetry.ts`,
  `models/intent-decider.ts`, `graph/price-per-square-meter.graph.ts` (`invokePriceTool`),
  and `graph/http-graph-checkpoint.adapter.ts`: reuse named span/categorical policy patterns. Add run,
  confidenceGate, transitions, decision/physical attempts, tool and checkpoint-operation spans.
- `apps/{api,worker,ai}/src/otel.ts`: existing SDK bootstrap. Default Pg instrumentation can
  export raw error status; HTTP instrumentation captures query URLs. Sanitize at the necessary
  export boundary using supported typed SDK mechanisms; cover status/events/attributes/links,
  names and resources, without dropping required span identity or useful safe attributes.
- `packages/infrastructure/src/shared/telemetry/trace-context{,.test}.ts`: existing exact
  parent-ID proof, strict carriers and producer/consumer helpers are adequate; preserve them.
- Existing `integration/ask-{intent-decision,model-explanation,price-run}.integration.test.ts`,
  `integration/fixtures/ask-{intent,model}-fixture-bootstrap.ts`, `integration/support/fixture.ts`:
  reuse owned Compose, SQL faults, native restarts and exact cleanup. Existing fake AI entrypoints
  omit OTel preload; the new tracing fixture must retain `-r ./dist/otel.js` before imports.

## Tasks & Acceptance

**Execution:**

- [x] Listed domain/contracts/application/API paths and direct tests: add compatible combined
      admission/evidence and necessary exhaustive fake branches; keep historical contracts strict.
- [x] Listed graph/factory/execution and model/checkpoint repository paths: compose existing
      capabilities and recovery with current grants/leases, conservative reservations and receipt identity.
- [x] `migrations/6008_*.sql` and existing migration/repository tests: admit the new basis/partition
      with additive checks/fences; prove populated historical bytes survive and invalid writes fail.
- [x] Listed AI telemetry seams and `apps/{api,worker,ai}/src/otel.ts` plus direct tests: fill
      missing spans and attributes and prevent demonstrated automatic export leakage. Record queue and
      total-run duration from existing admission times; decision/confidence/source/degradation and
      confirmation; actual provider/model, available usage/cost, duration; policy and tool outcomes.
- [x] `integration/ask-run-trace.integration.test.ts`, narrow typed fixtures under
      `integration/fixtures/`, and root `package.json`: one discoverable native campaign with owned
      export capture, both fake provider capabilities, correct preload, bounded flush and cleanup.
- [x] Existing `docs/api/ask-model-explanation.md`, `docs/ask-intent-decisions.md`,
      `specs/adrs/0027-receipt-bound-model-explanations.md`, epic Notes and this plan: concisely record
      D-102, the new supported contract and actual proof/limits. Do not create another report.

**Acceptance Criteria:**

- Given a synthetic PT/EN combined-mode request, when the actual API/broker/worker/AI stack
  completes, then public inspect and SSE return the exact deterministic receipt/result and
  validated model explanation, and one exported trace contains request, publish, consume, run,
  every executed node, decision, tool, generation and checkpoint spans with correct ancestry
  and the architecture's safe attributes. All required spans must actually be observed.
- Given low-confidence pause and explicit confirmation across restart, when execution resumes,
  then the retained decision is not called again, the original run trace remains linked and
  validated confirmed operands produce the receipt-bound explanation once.
- Given acceptance before an injected saver/terminal ACK failure, when a fresh claim recovers,
  then immutable decision/tool/explanation evidence and budget survive with no second generation;
  stale/cancelled authority cannot reserve, checkpoint or complete.
- Given non-executable intent or populated legacy state, when new code/migration runs, then
  unavailable outcomes generate nothing and legacy documents/partitions recover unchanged;
  wrong-mode/partition access is refused.
- Given synthetic sensitive values in the tested path and an actual SQL fault, when the complete
  export is scanned, then no prompt, response, key/grant, URL query, connection string or raw
  error appears in names, status, events, attributes, links or resources; failures remain categorical.
- Given the stabilized version, when applicable coverage, build, strict typecheck, lint, formatting,
  native campaign and independent quick review run, then all required gates pass without weakened
  tests/hooks, skips, automatic retries or timeout increases.

## Implementation Notes

- Added the closed combined discriminator and its exact checkpoint partition. The historical
  routed compiler keeps its original terminal edge; only the new partition installs the existing
  receipt-bound explanation node. Both providers retain their existing privacy/budget policies.
- Migration 6008 wraps historical validators only for validation and extends the existing model
  fences. No stored documents or earlier migrations are rewritten. Completion verifies the
  retained tool receipt and accepted explanation before the atomic terminal transaction.
- The exporter projects the complete typed SDK span immediately before OTLP serialization in
  API, worker and AI. The shared scalar vocabulary excludes arbitrary SDK/SQL/HTTP content while
  preserving IDs, parents, timing, categorical status, graph transitions and policy events.
- The native campaign uses owned Compose resources, the real Gateway decision adapter with a
  synthetic transport, the existing explanation port with a synthetic provider, and a bounded
  local OTLP capture process. Its AI preload and AppModule resolve the same mounted `dist`,
  retaining one SDK/shutdown bridge and the normal bounded Nest lifecycle flush.

## Plan Change Log

- No scope change. Native preparation stopped when the Dev Container Docker daemon became
  unreachable during the AI image deploy (`rpc error: Unavailable ... EOF`). Migrations and API
  image builds had completed; worker preparation and the native campaign had not started.
  The parent confirmed a host global OOM killed the internal dockerd at 12:58:13 UTC (about
  2.57 GB RSS) and owns recovery of that Dev Container daemon; production services remain normal.

- The first native execution exposed an SSE test-parser error (`event:` precedes `id:`); use
  the existing frame parser's non-comment filter. The second passed functional and PT/EN ancestry
  assertions but exposed split fixture module ownership at restart: image preload versus mounted
  AppModule. Setting the fixture working directory to its mounted AI app makes the unchanged
  `-r ./dist/otel.js` and AppModule share one SDK/lifecycle. No runtime mechanism, assertion,
  timeout, retry or image was changed for these fixture corrections. The third full run passed.

## Review Triage Log

### 2026-10-26 — Independent quick review, first pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Queue time included confirmation/execution age. Verified in `claim()`
    and `resumeRouted()`. Measure only the queued interval at the existing claim transition,
    pass a bounded scalar in the new internal DTO and exclude it from durable checkpoints.
    Direct repository tests prove 125 ms despite 60 seconds of run age and zero on reclaim;
    execution and graph tests prove separate total duration and recovery with changed queue time.
  - `[medium]` `[patch]` Export removed existing safe dependency/policy identities. Verified
    against both telemetry helpers and the three settings. Preserve only their three categorical
    dependency values and 18 fixed policy names. The full typed exporter test verifies those
    helpers' actual attributes survive and arbitrary text still disappears.
- Both corrections stay within the new unpublished contract; no new endpoint, stored timing
  state, registry or planning round. Parent inspected the changed behavior and direct risks.
  Native worker-driven confirmation/resume remains intact, with queue bounds against its retained
  confirmation time and exported start; accepted-artifact reclaim checks zero. Final campaign
  passed those strengthened assertions on the stabilized code (125.57 seconds).

## Verification

- Run directly affected unit cases first. Then run affected workspace coverage with the exact
  existing `scripts/test-coverage.sh` flags/floors and reuse unchanged workspace proofs by identity.
- Run root build, strict typecheck and lint sequentially; use final applicable unit gates and
  changed-file Prettier/Markdown checks. Preserve results rather than repeating passed commands.
- Prepare only required native images sequentially, then execute the new full
  `test:integration:ask-trace` campaign once on the stabilized version. Historical test assertions
  stay intact; run only regressions required by changed migration/contracts/recovery dependencies.
- Native fixture must capture real exported spans from all three processes, prove explicit parent
  edges and scan the entire export without dumping forbidden values. Use fake providers only.
- Parent owns independent quick review, final commits and ticket closure; implementer must not
  commit, push, deploy, delegate or change unrelated resources. Report exact commands/results/log paths.

### Recorded execution evidence

- All six affected workspaces passed the exact unchanged coverage flags/floors from
  `scripts/test-coverage.sh`: contracts 290, application 293, infrastructure 544, AI 336, API 217
  and worker 243 tests (1,923 before review corrections). Initial six-workspace log:
  `/tmp/rei-one-trace-coverage.log`; final contracts/AI/API/worker gate after their last runtime
  changes: `/tmp/rei-one-trace-final-coverage.log`. Application/infrastructure source identity
  remained unchanged after their passing gate. Every workspace exceeds 80% statements, lines
  and functions, and 75% branches.
- Root build passed (`/tmp/rei-one-trace-build.log`); the final AI-only runtime adjustments passed
  its build (`/tmp/rei-ai-build.log`). Root strict typecheck, including integration, passed
  (`/tmp/rei-one-trace-typecheck.log`), and the final fixture changes passed the integration
  typecheck (`/tmp/rei-one-trace-final-integration-typecheck.log`).
- Final root lint with context-boundary/migration checks passed
  (`/tmp/rei-one-trace-final-lint.log`). Changed-file formatting and five-document Markdown checks
  use the repository's existing rules; Markdown requires `--no-globs` to avoid generated renders.
- Prepared only migrations/API/AI/worker serially. After parent-owned daemon recovery, reused
  migrations/API and built only AI/worker: `/tmp/rei-one-trace-ai-image.log` and
  `/tmp/rei-one-trace-worker-image.log`. No production resource was changed by the implementer.
- Native command with prepared images:

  ```sh
  pnpm exec vitest run --config vitest.integration.config.ts integration/ask-run-trace.integration.test.ts
  ```

  Passed 1/1 in 80.15 seconds (`/tmp/rei-one-trace-native.log`). This is the final native portion
  of the discoverable `pnpm run test:integration:ask-trace` command, without rebuilding validated
  images. It observed the required real spans/parents and safe attributes from all three services,
  whole-export privacy after SQL failure, PT/EN inspect/SSE, restart/confirmation, accepted-artifact
  recovery with unchanged reservations, unavailable and authority fences, and populated historical
  bytes/partitions. Exact fixture cleanup passed and no container remained active.

- The necessary historical regressions run inside this populated upgrade/recovery campaign;
  existing historical assertions were retained. No unchanged broad historical campaign was rerun.
- Limits: providers are synthetic; no live provider quality, billing or production export rollout
  is claimed. Independent quick review and commit results are recorded below.

### Verification after the two review corrections

- Direct affected checks passed: contracts 14, repository 19 and AI 27 tests (60 total).
- Repeated only the three affected coverage gates with unchanged flags/floors: contracts 290
  (91.06/91.21/92.89/92.70), infrastructure 546 (83.34/76.50/89.30/85.12) and AI 338
  (95.06/90.46/95.45/96.73), in statements/branches/functions/lines order.
  Log: `/tmp/rei-one-trace-review-coverage.log`. Existing application/API/worker results remain
  valid; the changed shared export policy is checked through the full typed exporter regression.
  The six affected workspace results now account for 1,927 passing tests.
- Root build passed (`/tmp/rei-one-trace-review-build.log`). The first subsequent typecheck
  caught missing union narrowing in the updated graph test. Added an explicit discriminator
  check without casts/suppression; that graph test passed all eight cases. Runtime is unchanged
  by this test-only correction; coverage/build were retained rather than repeated.

### Shared exporter dependency correction

The parent's targeted dependency check found the same categorical-loss root cause in the
unchanged scheduled-collection wrapper: four finite counts and its replay boolean were missing
from the global projection. Reassessed the boundary before another attempt: it serves all three
apps, so its closed vocabulary must preserve the existing manually instrumented shared delivery
contract as well as Ask. Checked that wrapper and both AI policy emitters; retained their exact
closed categories/counts without an open prefix rule, new registry or permanent diagnostic.
The contracts projection test and full typed worker exporter test cover those five fields.

The preserved post-review native campaign passed 1/1 in 128.09 seconds, including queue bounds
across real worker confirmation/resume and zero queue time on accepted-artifact reclaim
(`/tmp/rei-one-trace-review-native.log`). Its images preceded only the five-field collection
projection correction. The last native run used the final compiled module and passed.

Final contracts build and coverage passed with unchanged floors (290 tests, same percentages),
and the worker exporter test and worker strict typecheck passed. Logs:
`/tmp/rei-one-trace-final-contract-build.log`,
`/tmp/rei-one-trace-final-contract-coverage.log`,
`/tmp/rei-one-trace-final-worker-export.log`,
`/tmp/rei-one-trace-final-worker-typecheck.log`.
The final correction changes no declaration or caller; reuse the other root build/typecheck/lint
and coverage results by source/dependency identity, with changed-file hooks as the final gate.

Runtime and tests are committed separately with normal hooks. For the final native images,
reuse the fully built bases and copy only the rebuilt `trace-export.js` into API/AI/worker;
verify its SHA-256 inside each resulting image before the campaign. Entrypoints and other files
remain identical; migrations are unchanged. This avoids repeating dependency packaging for a
five-field projection correction. The first temporary Dockerfile used an unsupported bare image
ID in `FROM`; named local tags pinned to those IDs correct the executor reference without changing
code or running a campaign. Image preparation log: `/tmp/rei-one-trace-final-module-images.log`.

### Final stabilized native evidence

- `pnpm exec vitest run --config vitest.integration.config.ts integration/ask-run-trace.integration.test.ts`
  passed 1/1 in 125.57 seconds; `/tmp/rei-one-trace-final-native.log`.
  All six acceptance rows passed, including native worker-driven confirmation/resume, exact
  zero on reclaim, populated upgrade, refusal fences, ancestry and whole-export privacy.
  Owned cleanup passed; no production service was changed.
- Final root strict typecheck and lint passed after the first review corrections:
  `/tmp/rei-one-trace-review-typecheck-final.log` and `/tmp/rei-one-trace-review-lint.log`.
  Final collection-projection changes passed contracts build/coverage, worker exporter/typecheck
  and normal changed-file hooks. Existing unaffected gate results are reused as described above.
- The final derivative images retain the existing runtime, entrypoints and dependencies; only the
  compiled projection module was updated. Its hash was verified inside all three images.

- api: `sha256:f3f560feba304010e77875190697cec5be141379f150d52afa484de1d22f2e99`.
- ai: `sha256:22c59a8d531e1f21911ba71aec016fb45f7dd2cb1eb9b6a8ce36fde819b2c8bf`.
- worker: `sha256:f4c4805c8d84f2120bb5157d82ec4cb23728a2f3970e15589af06fffe8d15ae8`.
- Shared compiled module SHA-256: `8839b3058c1a71ad57fdd6d6d8c2bd58e457524ecfa5883db5a70303c036d513`.
- Base/image identities: `/tmp/rei-one-trace-final-image-identities.json`.

## Auto Run Result

- Implemented D-102: one compatible routed, deterministic price and receipt-bound explanation run,
  with private causal traces.
- Parent inspected the full changed diff and matched all six acceptance rows to the recorded checks.
  Verification commands, results and limits are preserved above.

### Changed files

- `_bmad-output/initiative-real-estate-intelligence/epic-ask/epic-ask.md`: Material decision and
  supported combined-mode delivery.
- `_bmad-output/initiative-real-estate-intelligence/epic-ask/story-one-trace-per-run-plan.md`:
  Acceptance, verification and independent review record.
- `apps/ai/src/execution/execution.service.ts`: Execute the new partition and record causal run
  measurements.
- `apps/ai/src/graph/explained-price.graph.ts`: Compose the retained routing/tool/explanation graph
  and instrument actual work.
- `apps/ai/src/graph/http-graph-checkpoint.adapter.ts`: Compose the retained
  routing/tool/explanation graph and instrument actual work.
- `apps/ai/src/graph/intent-routing.graph.test.ts`: Direct contract, graph or export regression
  assertions.
- `apps/ai/src/graph/intent-routing.graph.ts`: Compose the retained routing/tool/explanation graph
  and instrument actual work.
- `apps/ai/src/graph/price-graph.factory.ts`: Compose the retained routing/tool/explanation graph
  and instrument actual work.
- `apps/ai/src/graph/price-per-square-meter.graph.ts`: Compose the retained routing/tool/explanation
  graph and instrument actual work.
- `apps/ai/src/graph/price-telemetry.ts`: Compose the retained routing/tool/explanation graph and
  instrument actual work.
- `apps/ai/src/graph/remote-checkpoint-saver.ts`: Compose the retained routing/tool/explanation
  graph and instrument actual work.
- `apps/ai/src/models/gateway-privacy.verifier.ts`: Physical attempt measurements and safe gateway
  cost parsing.
- `apps/ai/src/models/intent-decider.ts`: Physical attempt measurements and safe gateway cost
  parsing.
- `apps/ai/src/models/intent-evaluation.ts`: Physical attempt measurements and safe gateway cost
  parsing.
- `apps/ai/src/models/model-telemetry.test.ts`: Direct contract, graph or export regression
  assertions.
- `apps/ai/src/models/model-telemetry.ts`: Physical attempt measurements and safe gateway cost
  parsing.
- `apps/ai/src/otel.ts`: Install the supported private exporter in the existing SDK.
- `apps/ai/src/private-trace-exporter.test.ts`: Direct contract, graph or export regression
  assertions.
- `apps/ai/src/private-trace-exporter.ts`: Typed full-span privacy projection before serialization.
- `apps/api/src/ask/ask-live.controller.ts`: Admit and orchestrate the explicit combined contract.
- `apps/api/src/otel.ts`: Install the supported private exporter in the existing SDK.
- `apps/api/src/private-trace-exporter.test.ts`: Direct contract, graph or export regression
  assertions.
- `apps/api/src/private-trace-exporter.ts`: Typed full-span privacy projection before serialization.
- `apps/worker/src/otel.ts`: Install the supported private exporter in the existing SDK.
- `apps/worker/src/private-trace-exporter.test.ts`: Direct contract, graph or export regression
  assertions.
- `apps/worker/src/private-trace-exporter.ts`: Typed full-span privacy projection before
  serialization.
- `docs/api/ask-model-explanation.md`: Combined-mode public contract and observed evidence limits.
- `docs/ask-intent-decisions.md`: Combined-mode public contract and observed evidence limits.
- `integration/ask-checkpoints.integration.test.ts`: Required exhaustive new-partition test typing.
- `integration/ask-run-trace.integration.test.ts`: Native ancestry, privacy, upgrade and recovery
  campaign.
- `integration/fixtures/ask-trace-capture.ts`: Owned bounded OTLP capture fixture.
- `integration/fixtures/ask-trace-fixture-bootstrap.ts`: Synthetic provider bootstrap with one
  telemetry SDK owner.
- `migrations/6008_ask_routed_explanations.sql`: Additive combined-mode checks and existing model
  fences.
- `package.json`: Discoverable sequential native trace command.
- `packages/application/src/ask/ask-live.facade.ts`: Admit and orchestrate the explicit combined
  contract.
- `packages/application/src/ask/ask-run.service.ts`: Admit and orchestrate the explicit combined
  contract.
- `packages/contracts/src/ask/ask-live.dto.ts`: Extend the closed combined mode while preserving
  historical contracts.
- `packages/contracts/src/ask/graph-checkpoint.dto.ts`: Extend the closed combined mode while
  preserving historical contracts.
- `packages/contracts/src/ask/intent-decision.dto.test.ts`: Direct contract, graph or export
  regression assertions.
- `packages/contracts/src/ask/intent-decision.dto.ts`: Extend the closed combined mode while
  preserving historical contracts.
- `packages/contracts/src/ask/intent-decision.types.ts`: Extend the closed combined mode while
  preserving historical contracts.
- `packages/contracts/src/ask/run-execution.dto.ts`: Extend the closed combined mode while
  preserving historical contracts.
- `packages/contracts/src/index.ts`: Extend the closed combined mode while preserving historical
  contracts.
- `packages/contracts/src/shared/trace-export.test.ts`: Direct contract, graph or export regression
  assertions.
- `packages/contracts/src/shared/trace-export.ts`: Shared closed operational trace vocabulary.
- `packages/domain/src/ask/ask-live.types.ts`: Extend the closed combined mode while preserving
  historical contracts.
- `packages/domain/src/ask/graph-checkpoint.types.ts`: Extend the closed combined mode while
  preserving historical contracts.
- `packages/domain/src/ask/intent-decision.types.ts`: Extend the closed combined mode while
  preserving historical contracts.
- `packages/infrastructure/src/ask/ask-run.pg-repository.ts`: Enforce the new basis, authoritative
  receipts and exact checkpoint partition.
- `packages/infrastructure/src/ask/graph-checkpoint.pg-repository.ts`: Enforce the new basis,
  authoritative receipts and exact checkpoint partition.
- `packages/infrastructure/src/ask/http-run-executor.adapter.ts`: Enforce the new basis,
  authoritative receipts and exact checkpoint partition.
- `packages/infrastructure/src/ask/in-memory-run-executor.adapter.ts`: Enforce the new basis,
  authoritative receipts and exact checkpoint partition.
- `packages/infrastructure/src/ask/model-explanation.pg-repository.ts`: Enforce the new basis,
  authoritative receipts and exact checkpoint partition.
- `specs/adrs/0027-receipt-bound-model-explanations.md`: Compatible D-102 graph and private export
  contract.
- `apps/ai/src/execution/execution.service.test.ts`: Distinguish queue interval from total run age.
- `packages/infrastructure/src/ask/ask-run.pg-repository.test.ts`: Prove exact claim queue timing
  and zero on reclaim.

### Review and gates

- Independent quick review: two verified medium findings, both patched; no rejects or deferrals.
  Parent's focused dependency correction resolves the same export-vocabulary root cause for
  scheduled collection. No further general review was opened.
- Patched counts: high 0, medium 2 from quick review, plus the parent's related dependency fix.
  Follow-up review recommendation is false: direct strict-contract/export/repository/graph tests
  and the final native campaign verify the concrete changed risks; no unverified risk remains
  that would justify another review round.
- All six acceptance rows are supported by the recorded native assertions and gates above.
  Reuse unchanged workspace proofs; 1,927 passing affected-workspace tests are accounted for.
- Residual limits: synthetic providers only; no live quality, billing or production exporter
  evidence is claimed. The final published goal campaign remains a later requirement.

### Delivery identity

- Runtime: `29641dfc6b7583fa4c758105d6d1fa505e7f8057`.
- Tests: `82f824282c78063685bd48ed107632df507b9675`.
- Both commits passed normal secrets/format/lint/commit-message hooks. Reviewed non-Markdown
  bytes were checked after hooks and remained identical. Documentation-only updates reuse
  these product proofs.

## Story Closure

- The goal orchestrator marked ticket 5.14 done on 2026-10-26 after all six acceptance rows,
  the required independent review and applicable gates were verified.
- Delivered runtime: `29641dfc6b7583fa4c758105d6d1fa505e7f8057`.
- Delivered tests: `82f824282c78063685bd48ed107632df507b9675`.
- Delivery documentation: `54ee94b88fcddda5217eee3f1927489a98d5af88`.
- All 56 reviewed files are committed. All 51 reviewed non-Markdown file hashes remained
  identical after normal hooks; the final native campaign passed 1/1 in 125.57 seconds.
- This closure changes only story metadata. Existing product evidence is reused; the later
  published goal campaign remains required and is not claimed here.
