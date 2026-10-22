---
title: 'Ask: confirmation and the run states'
type: 'feature'
ticket: '16'
created: '2026-10-22'
status: done
baseline_revision: '2659a7a2ebbd6f10d8f474b3446e67bdfc06572a'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md
warnings: ['oversized']
deferred: []
---

<!-- prettier-ignore-start -->
<intent-contract>

## Intent

**Problem:** Ask currently follows only the queued prepared example. Visitors cannot inspect the
confirmation proposal and edited-input distinction or deliberately select every public run state.

**Approach:** Extend the existing Placa Ask surface with real catalogue-backed state inspection,
local unsent operand editing, explicit continuation of the recorded confirmation preview, and honest
state-specific explanations. D-068 resolves the verify/design mismatch: this is prepared read
continuation, never acceptance of visitor edits or persisted run mutation.

## Boundaries & Constraints

**Always:** Preserve D-043/D-066/D-067/D-068, exact public parsers, metadata, original versus
recorded-confirmation inputs and backend result. Capabilities stay in memory/headers; questions/edits
stay in local memory, never URLs/logs/storage. Use the incumbent Placa system, PT/EN, actual authored
AskConfirm/DesktopAsk/States references, accessible native controls and 44px targets. Keep ten-second
reads, strict monotonic sessions, one bounded transport reconnect and manual cursor recovery.
Selection changes/unmount abort old work and clear authority-scoped cache. Use strict
TypeScript/Vitest integration, real owned HTTP/Compose/Chromium and unchanged coverage/gates.

**Never:** Add backend handlers/contracts, change fixed fixtures, submit an edited question/operand,
calculate a business result in the browser, label a recorded confirmation as visitor acceptance,
imply that abort cancels a run, fabricate quota/capacity/queue/expiry facts, conflate prepared and
persisted bases, or add protected/V2/headless functionality. No live models, real collection,
default-stack mutation, VPS/server/deploy/push, secret-file access, gate changes or unsolicited
design-system drift repair.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                            | Expected Output / Behavior                                                                                                                                              | Error Handling                                                      |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| State inspection      | Each of seven real catalogue entries                     | Deliberate snapshot selection; correct localized status, question, steps, times and explicit unavailable runtime facts; no auto-advance                                 | Missing/mismatched entry/read is sanitized and manually recoverable |
| Confirmation pause    | awaiting_confirmation snapshot                           | Proposal as question, actual 0.64 confidence, visible 0.85 gate, degraded warning, original operands, no result; local editable draft explicitly not sent               | No fabricated mutation or automatic stream advancement              |
| Local editing         | Edited price/area strings; reset/rephrase; locale change | Local values survive presentation changes, can be restored, and rephrase focuses the unsent question; no submission/calculation/storage                                 | Empty/invalid drafts never become backend inputs or authority       |
| Recorded continuation | Explicit prepared-preview action                         | Real SSE records synthetic 81000000/90 confirmation then received 900000 minor units/m² result; original 80000000/80 remains distinct; edits never falsely acknowledged | Existing bounded cursor recovery retains admitted evidence          |
| Other states          | queued/running/completed/failed/cancelled/expired        | Correct direct snapshot; nonterminal preview available separately; terminal reason sentence; retry only rereads/replays prepared data                                   | Never infer a terminal from EOF or say the visitor cancelled        |
| Intent unavailable    | Prior thread run                                         | Name actual recognized unavailable intent and supply real same-place Search route, no answer/model claim                                                                | Draft and navigation context retained                               |
| Authority change      | Rapid selection, old pending read/stream, navigation     | Only current grant/run is displayed; obsolete callbacks ignored and cache cleared                                                                                       | Abort is read cancellation only; no POST                            |
| Limits absent         | No quota, slots, queue position or deadline in basis     | Explicitly unavailable, with browsing/draft still functional                                                                                                            | No simulated thread-full/quota lock/countdown                       |
| Failure/recovery      | HTTP/auth/parser/deadline/stream corruption              | Sanitized message, retained valid record and deliberate appropriate retry                                                                                               | No raw payload disclosure or mutation replay                        |

</intent-contract>
<!-- prettier-ignore-end -->

## Code Map

Route: full (auto), estimated well over 100 changed lines across more than five nonmechanical
UI, test and browser-harness files. Risk remains the ticket's medium; no backend mutation opens.

- `apps/web/src/ask/AskScreen.tsx`: `ValidAskScreen`, `follow`, ownership refs and scoped Query cache;
  currently hardcodes queued catalogue entry and immediately follows. Reuse ownership/admission;
  distinguish inspect from follow without regressing the existing queued journey.
- `apps/web/src/ask/AskRunRecord.tsx`, `AskThread.tsx`, `ask-resources.ts`, `src/styles/ask.css`:
  shared record/history/resources; retain exact fractional area formatting and received evidence.
  Add focused confirmation/state presentation rather than a second screen/transport/cache.
- `apps/web/src/ask/ask-client.ts`, `ask-stream.ts`, `ask-session.ts`, `ask-equality.ts`: validated
  read-only API/SSE, strict framing, deadline, immutable identity/operands and cursor. Reuse;
  no mutation API. Existing typed session already supports seven states.
- `packages/contracts/src/ask/ask.read.types.ts`, `ask.read.dto.ts`: closed public shapes, seven
  states, confirmation `recorded-synthetic`; consume only, do not relax or recalculate.
- `packages/infrastructure/src/ask/synthetic-ask.adapter.ts`: fixed snapshots and finite previews.
  Awaiting GET has null confirmation/result; preview records edits at second 3 and completion at
  second 4; later GET stays awaiting. All example place IDs bind to sao-paulo-pinheiros, not the
  selected navigation place. Prior history is unavailable intent. Preserve every fixture.
- `apps/api/src/ask/ask.controller.ts`, `integration/ask-contracts.integration.test.ts`: prepared
  availability explicitly `commandHandlers:false`; confirm/cancel POSTs 404. Existing integration
  verifies all states and recorded edits, no SQL mutations. Do not turn this into live execution.
- `apps/web/src/ask/*.test.ts*`: existing eight files/87 cases, `ask-fixtures.test.ts` only exports
  queued/running/completed/prior. Extend fixtures/tests for all states and interactions; preserve
  UTF-8 prefix, member-order, exact duplicate, fractional operand and deadline regressions.
- `integration/web-ask.integration.test.ts`, `integration/support/ask-web-evidence.ts`,
  `ask-attempt.ts`, `ask-campaign.ts`, `search-campaign.ts`: reuse owned stack, oracle, lifecycle
  and truthful failure ledger. New scoped states campaign may share helpers; preserve the old
  seven scenarios. Add new UI source paths to actual source hashing. JSON surface hashes must
  describe final bytes; format generated reports consistently before hashing.
- `apps/web/.impeccable/surfaces/src-ask-askscreen-tsx.md`, `apps/web/DESIGN.md`,
  `docs/design/canvas/project/{AskConfirm,DesktopAsk,States}.dc.html`: inherited candidate 4,
  seed `3d3cd1ae`, code-led Operate extension. No new visual-world roll/comp/system repair.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/.impeccable/surfaces/src-ask-askscreen-tsx.md` — persist the extension direction
      contract before UI code. Use Impeccable faithfully; context was already loaded once this session,
      do not rerun it. Read craft-floor immediately before UI edits. Owner delegation/D-068 settles
      confirmation; update brief through the skill's supported command and reread it.
- [x] `apps/web/src/ask/AskScreen.tsx` — introduce deliberate catalogue state inspection and
      separate recorded preview continuation, cancellation-safe authority changes and recovery.
      Preserve the original queued follow action and all 6.9 behavior.
- [x] `apps/web/src/ask/AskConfirmation.tsx`, `AskRunRecord.tsx`, `ask-resources.ts`,
      `src/styles/ask.css` — implement the proposal/gate, local unsent editable fields/reset/rephrase,
      explicit read-only continuation boundaries, original/recorded comparisons and terminal reasons.
      Names/files may be minimally adjusted for cohesion. Do not promise recorded values before the
      server supplies them: explain that the finite preview contains preset edits, then display its
      actual admitted confirmation. Never hardcode result/operands into production presenters.
- [x] `apps/web/src/ask/*.test.ts*` — cover matrix at visible UI surface in PT/EN, all states,
      no premature result, edit/privacy/reset/rephrase, history, exact evidence, locale, selection
      races, old authority abort/cache cleanup, failure/manual recovery and unchanged transport rules.
- [x] `integration/web-ask-states.integration.test.ts` and shared typed support — execute real
      API/SSE + sandboxed browser journeys; independent oracle for all states and confirmation;
      explicit no POST, no SQL change, no private URL/storage/diagnostics, no default-stack changes.
      Capture 390/960/1440 PT/EN confirmation, terminal comparison, state variants and authored
      references with real source/asset hashes, accessibility and keyboard evidence. Preserve primary
      and cleanup failures with all attempts recorded, including failures before first surface.
- [x] Story plan/evidence — record actual verification and limitations; leave parent-owned finish,
      final review/acceptance and commits to the parent. No claim that live confirm/cancel/quotas ran.

**Acceptance Criteria:**

- Given the real owned prepared API, when a visitor inspects each catalogue state, then the screen
  shows that snapshot and actual reason/evidence without automatically completing it or faking
  missing quota/slots/queue deadlines; the prior unavailable intent offers working Search.
- Given the awaiting-confirmation screen, when the visitor edits operands, restores them or
  reformulates, then native controls work, the draft is local/unsent, proposal/confidence/gate
  remain inspectable, and no result or mutation appears before explicit recorded-preview reading.
- Given that inspection pause and independently captured real stream, when the visitor chooses
  to read the recorded continuation, then completed evidence exactly matches the oracle,
  original/confirmed values are distinct and recorded-synthetic is not attributed to the visitor.
- Given locale changes, interrupted reads and rapid selection/navigation, when the visitor
  continues/retries, then retained facts/drafts remain correct and old authority cannot win;
  no private value enters URLs/storage/logs or outbound POSTs.
- Given PT/EN at 390/960/1440, when inspected against the authored references and operated by
  keyboard, then the inherited Placa hierarchy, targets, exact numbers, gate and layout remain
  legible with no horizontal page overflow or automated axe violations. Parent independently
  inspects valid captures and completes bounded finish/documenter handoffs before acceptance.

## Implementation Notes

- Extended the existing scoped read/session owner rather than introducing a second transport.
  State selection reads catalogue-backed snapshots without following; the existing queued follow
  journey remains. Explicit recorded continuation reuses the admitted session/cursor, including
  bounded reconnect and manual recovery. Selection and unmount cancel obsolete read authority.
- Added native, local string operand drafts keyed by received run identity, reset/rephrase controls,
  localized proposal/confidence/gate/degraded presentation, explicit missing-runtime facts and
  received terminal reasons. The presenter never calculates a price/m² result or submits edits.
  Original and recorded-synthetic operands are displayed separately only after admission.
  Draft initialization/reset uses integer/string money conversion so the maximum safe minor-unit
  value retains its final cent; fractional areas remain exact received values.
- Updated the inherited surface brief using Impeccable's supported write/read commands before UI
  edits, after reading craft-floor. No context rerun, new visual world, tokens or shipping asset.
- Added per-state PT/EN component cases and owned browser coverage with independent public-parser
  API/SSE oracle, SQL row digests, sanitized failure/cursor/race evidence, masked private drafts,
  final source/runtime-byte hashes and independent authored-reference captures. Existing seven
  Ask browser scenarios and transport tests remain intact.
- The first browser campaign, `ask-states-2026-10-22T11-26-32-814Z-1362e7dc`, truthfully records a
  failed harness selector: thread order is newest-first, so selecting its first button did not open
  prior history. The corrected selector uses the independent oracle's prior question. Its stack
  was removed and foreign resources preserved. No executor-only classification was inferred.
- Campaign `ask-states-2026-10-22T11-28-25-069Z-3201d083` completed all six original scenario rows,
  producing 26 responsive/state surfaces plus three authored references. Every surface passed
  whole-page axe, 44px targets, local fonts and overflow checks; no POST, private URL/storage/log
  payload, external request or SQL change was observed. Owned resources were removed and foreign
  resources preserved. A final harness rerun adds the final boundary audit as its own ledger row.
- Repository lint/typecheck/unit tests/build passed. The first concurrent coverage run timed out
  at the unchanged five-second component limit in two new cases and two existing AppShell cases
  while Docker builds were active; it is not counted as passing. State loops were split into
  independent cases for better failure isolation; no deadline, coverage floor or check was weakened.
  Final coverage, original/new browser regressions and integration results are recorded below once
  complete. Parent visual comparison, detector, independent finish/documenter, technical review,
  acceptance and commits remain intentionally unclaimed.
- The first parallel API/browser verification overlap also failed the pre-existing foreign-resource
  invariant when another owned test stack removed its own temporary containers/volume. This did
  not change the default stack; all original seven browser scenario rows passed. Verification was
  rerun strictly serially so the foreign inventory cannot confuse two independently owned stacks.
  The serial API rerun passed both tests. The serial coverage rerun passed all workspaces with
  unchanged floors (before the final exact-cent regression: web 500 cases, 97.44% lines and 90.55%
  branches); final-source verification is recorded after the remaining commands complete.
- Final-source `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed
  (web: 38 files/501 tests); serial `pnpm run test:integration:ask` passed 2 tests, and the combined
  original/new browser command passed 2 files/2 tests. `pnpm run test:integration:list` passed and
  lists both Ask browser campaigns. Touched source passed Prettier and `git diff --check`.
- Final complete campaigns:
  `apps/web/.impeccable/review/campaigns/ask-2026-10-22T11-33-49-973Z-34694c6d/` and
  `apps/web/.impeccable/review/campaigns/ask-states-2026-10-22T11-34-52-025Z-d43463d7/`.
  Each has seven approved attempt rows, source/runtime version metadata, SQL/network evidence,
  source-matched surfaces and clean owned teardown/foreign-preservation receipts. The extended
  campaign includes 26 surfaces and authored AskConfirm 390×1443, DesktopAsk 1440×1142 and States
  1280×1127 references. `results/integrity.json` records the independent post-run audit: all 54
  original and 177 extended manifest entries match final bytes, and both source hashes match the
  current source (`689c811861ea217e481d72040224a656835df4a0c33d8c9b0b3df62b12d2aede`).
- Final-source `pnpm run test:coverage` completed successfully across all workspaces with the
  original coverage floors unchanged. Web passed 38 files/501 tests with 96.30% statements,
  90.56% branches, 97.07% functions and 97.44% lines; the Ask subtree has 99.04% lines and
  94.57% branches. Implementation and serial verification are ready for the parent handoff;
  visual review, detector, independent finish/documenter, technical review and acceptance have
  not been started or claimed by this implementer. The existing Vite large-chunk build warning
  remains non-blocking. No commit was created.

## Plan Change Log

- Parent bounded visual round one inspected 47 production/reference images. One batched correction
  removed pending-question amber from historical terminal proposals and replaced terminal “yet”
  no-result wording with a final absence statement. PT/EN component and browser assertions cover
  both distinctions. Round two opened all 47 fresh images and found no further parent changes.
- The authoritative post-correction campaigns supersede the earlier implementer final-source
  snapshots without erasing their attempts: `ask-states-2026-10-22T11-46-53-355Z-5908068e` and
  `ask-2026-10-22T11-48-04-907Z-71a3754d`, under `apps/web/.impeccable/review/campaigns/`.
  Parent independently verified all 177/54 manifest hashes, 174/52 existing flat-copy hashes and
  current source hash `d0c0b7e633adf57cf905a5ea3738bcc1a23d9b97db684a0cbce484993c058029`.
  Both SQL before/after receipts report unchanged 47-table inventories; both teardown receipts
  confirm owned resources removed and foreign resources preserved. The states boundary receipt
  has no forbidden/outside request or diagnostic leak, no POST and no SQL changes.
- Parent post-correction verification passed: exact root lint/typecheck/test/build chain followed
  by complete coverage with unchanged floors; 2,635 unit tests including 501 web tests; serial
  API Ask integration (2 tests); combined original/states browser integration (2 files/2 tests,
  all seven scenario rows approved in each campaign); integration discovery. The single final
  Impeccable detector returned `[]`. Existing Vite chunk-size advice remains non-blocking.

### MatrixTestAudit

Every matrix row has passing executed coverage, not merely a proposed test:

| Matrix row                                      | Executed passing evidence                                                                                                                                                                                 |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State inspection / other states / limits absent | `AskStates.test.tsx` fourteen PT/EN catalogue cases; states browser row 001                                                                                                                               |
| Confirmation pause / local editing              | `AskStates.test.tsx` exact-cent, reset/rephrase/privacy and continuation cases; states rows 001/002                                                                                                       |
| Recorded continuation                           | `AskStates.test.tsx` received-confirmation and corrupt-preview cases; real API Ask tests; states row 002                                                                                                  |
| Intent unavailable                              | `AskStates.test.tsx` history/Search assertions, `AskScreen.test.tsx` prior-history case; states row 001                                                                                                   |
| Authority change                                | `AskStates.test.tsx` old pending-read/stream cases, `AskScreen.test.tsx` unmount case; states row 003 and original row 005                                                                                |
| Failure/recovery                                | `AskStates.test.tsx` refused/mismatched/corrupt reads, `AskScreen.test.tsx` manual retries, `ask-client.test.ts` bounded deadline/cancel/corruption regressions; states row 003 and original rows 003/004 |

All listed component/transport files ran in the passing root test and coverage commands. States
rows 004/005 additionally cover responsive/accessibility captures and authored references; row 006
records final privacy/read-only boundaries, and row 000 admits the independent oracle. These are
prepared read-only proofs, not live execution or full
WCAG certification. Independent finish review, documentation handoff and BMAD technical review
remain separate acceptance gates.

## Review Triage Log

### 2026-10-22 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free quick reviewer read the plan, governing context, complete
  baseline diff and surrounding contracts, adapter, session, navigation and privacy boundaries;
  returned `No findings.` No patch, deferral or rejection was required.

## Auto Run Result

- Implemented all seven prepared snapshot states, inspectable confirmation, private unsent operand
  drafts/reset/rephrase and deliberate recorded continuation. Backend facts, original/recorded
  values, terminal reasons, authority cancellation and manual recovery remain distinct and honest.
- Production changes: `AskScreen.tsx` owns state inspection/continuation; `AskConfirmation.tsx`
  presents proposal and draft; `AskRunRecord.tsx` presents actual evidence and terminal outcomes;
  `ask-resources.ts` and `ask.css` provide localized incumbent presentation. No backend mutation.
- Tests/support: `AskStates.test.tsx`, expanded `ask-fixtures.test.ts`, typed
  `web-ask-states.integration.test.ts`, source/crop evidence helper and Vite reference allowlist.
- Evidence/documentation: inherited surface brief, epic decision D-068, this plan, finish packet,
  independent finish review, documentation handoff and truthful complete/failed campaign ledgers.
- Review: quick lens completed with zero findings; patches high 0, medium 0, low 0; no deferred or
  rejected items. Follow-up review recommendation is false: no named unverified patch risk.
- Independent Impeccable finish disposition is `ship`, all five sections present, all 47 required
  images opened, no material fixes. Documentation handoff is complete; existing DESIGN.md and
  design.json fingerprints remain unchanged. Both reports are in `apps/web/.impeccable/review/`.
  Existing product/system narrative drift was reported without unsolicited repair.
- Every verification command listed below passed on the final production source, including root
  coverage with unchanged floors and serial owned API/browser campaigns; MatrixTestAudit above
  covers every row. Parent rechecked source/manifest/flat-copy hashes and SQL before/after equality.
  All 459 changed JSON files and seven JSONL files parsed. No tracked file was deleted.
- Residual limits: prepared synthetic read-only execution, not accepted visitor inputs, live
  confirm/cancel, durable runs, models, quotas/capacity/deadlines, deployment or comprehensive
  accessibility certification. The owner retains all VPS-dependent unlocks. No push was made.

## Orchestrator Acceptance

Accepted locally on 2026-10-22 after the completed build, matrix audit, independent visual finish,
documentation handoff and quick technical review. The ticket's fixture-based confirmation verify
passes under D-068: awaiting GET stays paused, explicit recorded-continuation reading reaches its
received terminal, and all seven catalogue states render independently. Local visitor edits are
not submitted or accepted; this acceptance does not unlock live mutation or VPS-dependent work.

Reviewed changes were committed as `f17f629` (implementation), `46d15d3` (tests) and `ea2504d`
(documentation/evidence), with active hooks. The documentation hook initially rejected long
Markdown lines; only wrapping/code presentation was corrected, normalized intent content remained
identical, and the complete hook rerun passed. No hook/configuration was weakened. Parent then
rechecked both final campaign source and manifest hashes and the unchanged design fingerprints.
The repository was clean after these three commits.

The final tracker readback exposed a metadata-only join mismatch: plan `ticket` must be the local
epic entry `16`, not the qualified dispatch `6.16`. Corrected that field without changing intent;
`tickets.py find` then read `built`, and `tickets.py mark ... 6.16 done` succeeded. This acceptance
commit records the actual tracker status; no production/test source changed after verification.

## Design Notes

Extend the existing Operate surface: plate/composer first, real catalogue inspection controls,
then thread and record. Confirmation is an amber waiting band with question/confidence/threshold,
paired labelled editable fields and a clearly separate prepared-preview reading action; no chat.
Phone uses bands; desktop retains rail/header and wrapping paired panels. The signature is the
place plate plus a dated run record, with a local inspection pause before recorded continuation.
No new tokens or shipping raster. Do not assert saved/durable return, visitor confirmation or
cancel-run support from the authored illustrative copy. Finish with at most two parent batched
inspection rounds, exactly one detector run, a fresh independent finish reviewer and documenter.

## Verification

```sh
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
pnpm run test:coverage
pnpm run test:integration:ask
pnpm exec vitest run --config vitest.integration.config.ts integration/web-ask.integration.test.ts integration/web-ask-states.integration.test.ts
pnpm run test:integration:list
```

Expect every command to pass, original coverage floors unchanged, real owned cleanup and all
scenario ledgers complete. Browser proof is prepared read-only, not live execution or complete
WCAG certification. Parent owns final reruns, bounded visual review, finish/documenter, BMAD
technical review and auto-commit implementation/tests/docs/acceptance without push or AI trailers.
