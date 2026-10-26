---
title: 'The success signals walked in production'
type: 'feature'
ticket: '6.13'
created: '2026-10-26'
status: 'in-review'
baseline_revision: 'c721e45c2cb49f8f9a83eb77223d415c1a5533aa'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/AGENTS.md
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/apps/web/DESIGN.md
  - /workspace/repos/real-estate-intelligence/apps/web/.impeccable/surfaces/src-ask-askscreen-tsx.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0014-zero-data-retention-for-user-text-routes.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-19 requires a public visitor to walk neighborhood evidence, a three-listing
property and a real Ask run including confirmation. The deployed Ask screen only inspects prepared
examples; additionally, an observed affirmative Gateway ZDR acknowledgement is rejected by the older
parser.

**Approach:** Bind the existing Ask controls and presenters to the existing live headless client,
keeping prepared inspection explicitly separate. Recognize the precisely observed affirmative ZDR
format without weakening fail-closed admission, then prove the public journeys on the manually
published branch.

## Boundaries & Constraints

**Always:** Preserve Placa, PT/EN, accessible names/status/focus, exact backend money and
provenance, prefix-aware URLs, immutable accepted receipts and server authority. Keep capabilities
random and memory-only, outside URLs, storage, logs and shared query keys. Distinguish transport
interruption from product termination. Preserve existing prepared behavior/tests and historical
evidence.

**Never:** Change deterministic calculations, quotas, privacy requirements, model identities,
deadlines, retries, hooks or assertions to manufacture success. No new execution engine, report
layer, inventory or general audit. Never read/search/edit `.env*`; processes may load them.
Production uses the host daemon; one heavy load at a time on the shared 8 GB/2 vCPU VPS. Keep the
landing available. No PR/merge/remote CI is needed: manual publication from the current branch is
authorized.

## I/O & Edge-Case Matrix

| Scenario    | Input / State                                                 | Expected Output / Behavior                                                                                            | Error Handling                                                                                |
| ----------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Submit      | Valid question in selected place                              | One explained routed admission; current run, ordered progress, exact server result and actual model explanation       | Disable duplicate submission; retain idempotent admission identity after uncertain transport  |
| Confirm     | Live awaiting-confirmation decision                           | Explicit confirmation binds current receipt and validated edited operands; subsequent SSE reaches the actual terminal | Invalid operands remain editable; stale/conflicting response does not fabricate completion    |
| Cancel      | Owned pending live run                                        | Explicit cancel command and actual returned terminal                                                                  | Unmount only aborts transport; no implicit business cancellation                              |
| Interrupted | SSE disconnect / place change                                 | Existing cursor/session recovery; stale callbacks cannot replace another run                                          | Preserve question/evidence, expose explicit recovery and bounded quota/reset feedback         |
| History     | Multiple live runs / prepared inspection                      | Select earlier records without replacing the active authority; prepared examples remain labelled                      | Never mix prepared and live authority                                                         |
| Privacy     | Old numeric or observed all-attempts positive acknowledgement | Exact model/route, no warnings, positive matching counts and exclusively system execution entries required            | Missing/negative/malformed/inconsistent/BYOK acknowledgement fails closed before visitor text |

</intent-contract>

## Code Map

- `apps/web/src/ask/AskScreen.tsx`: current composer has no submit; `readExample` owns prepared-only
  authority. Add live flow with existing controls and a clearly labelled prepared inspection
  section, without disrupting existing inspection tests.
- `apps/web/src/headless/ask-client.ts`: reuse `createHeadlessAskClient`, `LiveAskSession`,
  `followLiveAsk`, create/run/thread/confirm/cancel; `apps/web/src/config.ts` supplies prefix-aware
  `apiBaseUrl`. Reuse transport quota errors and strict parsers rather than new HTTP code.
- `apps/web/src/ask/{AskRunRecord,AskConfirmation,AskThread}.tsx`: currently prepared DTOs; accept
  the actual routed union with explicit narrowing. Live decision uses `probability`, confirmation
  uses `at`, original operands may be null, result may be typed unavailable, and explanation is
  present only on explained live runs. Do not fabricate prepared DTOs from live records. Preserve
  exact formatters.
- `apps/web/src/ask/ask-resources.ts`, `apps/web/src/styles/ask.css`: paired copy and existing
  responsive classes. Keep the incumbent design and add only controls/state copy needed for real
  operation.
- `packages/contracts/src/ask/{ask-live.dto,intent-decision.types,intent-decision.dto,model-explanation.dto}.ts`:
  authoritative create/confirmation/live/evidence contracts, not modification targets.
- `apps/ai/src/models/gateway-privacy.verifier.ts`: currently accepts only numeric filtering form.
  Protected fixed-public probe observed exactly

  ```text
  System credentials planned for: anthropic, bedrock, vertexAnthropic, claudeaws. ZDR requested: all 4 attempts support ZDR. Execution order: anthropic(system) → bedrock(system) → vertexAnthropic(system) → claudeaws(system)
  ```

  Model matched and warnings were empty. Preserve old format; validate the complete new grammar,
  count and provider correspondence, including mixed-case provider identifiers. Do not accept
  arbitrary substring matches or model-generated prose. Existing adapter already sets per-request
  ZDR and SDK retries zero.

- Existing AI model tests and web Ask tests: reuse fixtures and SDK mocks. Existing
  integration/headless/browser helpers cover transport and strict evidence.
  `integration/fixtures/probe-ask-production.ts` is a reusable public API proof, not a replacement
  for browser acceptance.

## Tasks & Acceptance

**Execution:**

- [x] `apps/ai/src/models/gateway-privacy.verifier.ts` and adjacent existing model tests: add the
      observed affirmative format and adversarial rejection regressions. One demonstrated
      compatibility defect; no policy relaxation. Official per-request contract:
      [Options](https://vercel.com/docs/ai-gateway/models-and-providers/provider-options) and
      [Gateway ZDR enforcement](https://vercel.com/blog/zdr-on-ai-gateway).
- [x] `apps/web/src/ask/AskScreen.tsx` and presenters/resources/styles: wire real create, ordered
      SSE, confirmation, explicit cancel, history, terminal, quota and transport recovery using
      existing clients. Only input normalization belongs in the browser; domain calculations remain
      server-side. Default real submission uses `routed-text-explanation-v1`.
- [x] Existing Ask component tests plus focused live tests: cover every matrix row, PT/EN, exact
      money, missing operands, explanation provenance, duplicate admission, unmount/change races and
      preserved prepared inspection. Do not weaken old tests.
- [x] `apps/web/.impeccable/surfaces/src-ask-askscreen-tsx.md`, this plan and `epic-web.md`: concise
      material boundary/evidence updates, preserving historical claims and their limits.
- [ ] Parent delivery: inspect full diff, run applicable gates sequentially, independent targeted
      Quick review, separate authorized implementation/test/docs commits. Record prepublication
      identity/recovery; manually publish changed images through the host operator; validate public
      browser journeys and Tempo evidence before closing.

**Acceptance Criteria:**

- Given the published prefixed HTTPS application and synthetic seed, when a visitor opens Bela Vista
  and its resolved property, then the screen shows one property with Aurora/Brisa/Cobalto listings
  and a neighborhood median with sample count, sources and computation time.
- Given that neighborhood, when the visitor submits a price/area question, then the visible live run
  reaches a real terminal with the exact backend receipt, actual accepted model explanation and
  provenance; a linked real Tempo trace records its actual execution chain.
- Given an ambiguous question, when the run pauses, then the visitor can inspect/edit and explicitly
  confirm the current proposal and follow it to its actual terminal; cancellation and interruption
  remain truthful.
- Given direct deep navigation, refresh, PT/EN and desktop/mobile viewports, when these journeys run
  over public HTTPS, then assets/API/SSE stay within the application prefix and landing routes
  remain available.

## Implementation Notes

- Directed transport inspection found that non-success responses discard their bodies. Reuse
  `parseAskQuotaRejection` from `ask.command.dto.ts` for the server's scope/reopensAt, retaining
  bounded reading and sanitized errors; this is the necessary quota/reset feedback dependency, not a
  new quota policy or a guessed reset time.
- Implemented an anchored, fully consumed acknowledgement grammar for the observed positive
  all-attempts format. Counts, unique planned providers and ordered system-only execution must
  match; mixed-case provider identifiers are preserved. The existing numeric form, exact
  model/route, warning rejection and pre-text fail-closed probe remain. Official provider guidance
  documents per-request ZDR enforcement; the precise acknowledgement grammar is observed runtime
  evidence rather than an invented provider guarantee.
- The mounted place owns an in-memory capability, idempotency key, immutable admission and live
  session. Existing `followLiveAsk` supplies bounded ordered SSE/cursor recovery and strict snapshot
  validation. Live history retains received records locally; prepared inspection has separate
  authority. No new engine, persistence, quota policy or automatic retry was added.
- Confirm binds the actual current receipt and normalized edited operands; null original operands
  stay visible and editable. Command responses must preserve accepted identity/evidence. Only actual
  terminal responses or admitted SSE progress can complete the presentation. Unmount and place
  navigation abort transport, while explicit cancel alone issues the business command.
- Focused local verification: four AI acknowledgement/explainer/SDK adapter files pass 100 tests;
  four existing Ask presentation files pass 57 tests; new live UI and existing headless client files
  pass 61 tests. Strict web TypeScript build passes. These are local tests with typed HTTP/SSE
  fixtures, not public model execution, publication, browser or Tempo acceptance. Parent gates,
  independent review, detector and public evidence remain pending.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass 1

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Cancellation before the first SSE snapshot is unavailable — admission
    already owns a validated run ID/capability, but both the panel and command guard require a
    snapshot. Expose explicit cancellation from that retained admission; validate the actual
    response against its identity and any previously received evidence. Add the demonstrated
    pre-frame interruption regression.
  - `[medium]` `[patch]` Prior live history disappears during the next admission — clearing the
    current snapshot also gates the retained thread selector. Render retained history independently
    while preserving the current admission as sole command authority; cover both quota rejection and
    pre-frame SSE interruption.

### 2026-10-26 — Review pass 2 (targeted follow-up)

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- Inspection confirms retained admission identity permits cancellation before the first SSE frame,
  earlier history remains selectable without acquiring current command authority, and the initial
  draft notice remains localized. No additional lens or general review was opened.
- Pass 1 patched two medium entries; the required follow-up patched none. The reviewed behavior
  has converged; `followup_review_recommended` is false.

### 2026-10-26 — Targeted executor follow-up

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- Independent inspection verifies the Search test split preserves every typed value, interaction
  and assertion, the complete combined-filter URL/API boundary, every ordering and area removal.
  Native deadlines, retries and thresholds remain unchanged. No product behavior was changed.

## Design Notes

This is necessary live binding, not a redesign or reopening completed prepared-increment stories.
The full route exceeds 100 changed logic lines. The parent already ran Impeccable context once this
session: do not rerun it. Before UI edits read
`/home/vscode/.codex/skills/impeccable-v2/reference/craft-floor.md`; apply its harden/operate
references. The parent performs one batched desktop/mobile inspection and at most one correction
confirmation. Run the required detector on changed UI paths. No extra design review cycle or broad
audit.

The implementation agent operates inside this already rendered workflow: do not render a new skill,
spawn agents, commit, deploy or run broad/heavy verification. Implement and run focused unit tests
serially, report remaining gates to the parent. Never expose credentials or capability values.
Parent handles production and final browser evidence.

## Verification

- Focused AI acknowledgement/model adapter tests, then focused web Ask/live component tests: all
  matrix behaviors pass without skips. The corrected live suite passes 22 tests and the unchanged
  Place overview suite passes 24. Full repository lint and strict workspace/integration typechecks
  passed; the initial full unit run preserved one draft-notice failure, now fixed and verified in
  its directly affected suite. Final affected-workspace coverage passes; the full serial build passes.
- Required Impeccable detector returns no findings for the changed UI paths. Public browser and
  model/trace evidence is still pending; no local fixture is represented as production acceptance.
- Parent sequentially runs repository lint, strict typecheck, affected workspace tests and builds;
  reuse unchanged backend/infrastructure integration evidence. Run applicable full product gate on
  stabilized code, not on every documentation edit.
- Required detector on changed UI paths; one desktop/mobile batch with keyboard and visible state
  checks, retaining existing accessibility campaign evidence outside changed controls.
- Manual host publication with recorded image/source/time/recovery and Caddy validation if changed.
  Public browser walkthrough captures neighborhood/property/provenance, real explained Ask,
  confirmation, SSE, refresh and both languages; selected persisted effects and matching Tempo
  trace. Preserve failed observations and delimit evidence. Do not mark acceptance without observing
  it.

### Final gate executor diagnosis

The affected AI coverage gate passed 356 tests (96.75% lines, 90.57% branches). The instrumented
web run passed 630 tests and failed only the existing combined Search filter/ordering test at its
unchanged native 5000 ms deadline. The original log is
`/tmp/rei-success-affected-coverage.log`. Host measurements showed collection worker CPU 22.52%
and PostgreSQL CPU 20.32%; only the Real Estate worker was gracefully paused and its recovery
recorded in protected host evidence. An isolated instrumented reproduction still exceeded the
deadline (`/tmp/rei-success-search-isolated.log`), disproving contention as a sufficient explanation.
The executor model is being corrected by separating that oversized test's independent contracts,
retaining all values, user interactions and assertions. No deadline, retry, coverage threshold or
product behavior is changed. Recheck that file before the final web coverage gate.

The four executor contracts passed in 1135/1320/1378/408 ms. All 36 Search tests passed
in 21.90 seconds; scoped coverage reached 91.22% lines and 88.04% branches under the unchanged
80/80/80/75 thresholds (`/tmp/rei-success-search-split-coverage.log`). Independent inspection
reported no finding. Final full web coverage passed alone with the worker paused; unchanged AI
coverage is reused. This corrects test granularity rather than masking the original failures.

Final stabilized web gate: all 45 files / 634 tests pass in 167.33 seconds, with 97.17% lines,
95.79% statements, 96.92% functions and 91.31% branches
(`/tmp/rei-success-web-coverage-final.log`). AI remains 26 files / 356 tests, 96.75% lines and
90.57% branches. Native assertions, hooks, thresholds and deadlines remain intact. Other unchanged
workspace test and integration results are reused from the recorded final-branch and seed/Ask
gates; contracts also passed 737 tests in the first parent run. The complete serial build passes
(`/tmp/rei-success-final-build.log`); publication and public acceptance are not yet observed.
