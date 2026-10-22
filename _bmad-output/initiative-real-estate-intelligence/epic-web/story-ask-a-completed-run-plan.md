---
title: 'Ask: a completed run'
type: 'feature'
ticket: '9'
created: '2026-10-22'
status: done
baseline_revision: 'b5fc8d3b1d3a186249c0f7b0257cdbd91a593250'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 1
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/apps/web/DESIGN.md
  - /workspace/repos/real-estate-intelligence/apps/web/.impeccable/surfaces/src-ask-askscreen-tsx.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md
warnings: [oversized]
deferred: []
---

# Ask completed-run Implementation Plan

**Goal:** Follow a prepared contract run to an explicit terminal in Placa, with exact returned
result and inspectable evidence, without pretending the stub executes the visitor's draft.

**Architecture:** Screen-local authenticated JSON/SSE transport and bounded session state consume
strict public prepared parsers. Query remains the ordinary-read cache; SSE is not polling. Extend
the existing place route/shell and locale resources; no backend, dependency or persisted mode
change.

**Tech Stack:** React Router, TanStack Query, i18next, Vitest/Testing Library, TypeScript
integration, Supertest/Testcontainers, Playwright and full-page axe. Route full: multiple
interacting modules, stream correctness and browser proof exceed 100 lines/five files. D-066 and the
goal's BMAD handoff override interactive writing-plans approval/location/subskills; this is the sole
implementation plan.

<!-- prettier-ignore-start -->

<intent-contract>

## Intent

**Problem:** Ask currently displays only a geographic placeholder. A visitor cannot follow the
published stub stream or inspect its completed result, provenance and explanation boundary.

**Approach:** Replace the Ask entry with the authored completed-record composition. Explicitly
follow the catalogue's queued example through its real API SSE, retain its most advanced snapshot,
and expose original question, exact result/operands, recorded steps, thread and availability.

## Boundaries & Constraints

**Always:** Follow CAP-19, D-043/D-051/D-066 and the surface brief. Preserve Placa, self-hosted fonts,
PT/EN, canonical place names, exact minor-unit formatting, Asking/Sale distinction, 44px controls,
manual recovery and all gates/coverage floors. Use strict public parsers on unknown JSON. Capability
is memory/header-only; draft stays router/local React state, never URL/log/storage. Mark prepared,
synthetic, non-live/non-durable truth adjacent to figures and the follow action. The fixture's
placeId null stays unscoped despite the navigation place. Load impeccable-v2 craft-floor immediately
before UI edits; context was loaded once in this session, do not rerun context or roll a concept.
Apply_patch for manual edits, pnpm only, exact owned local fixtures and cleanup preserving failures.

**Never:** Edit .env*, backend/contracts/migrations, authored artboards, global tokens/system docs,
unrelated files or data; commit/push/create branches in the implementer. No model/provider/VPS/real
sources/external messages. No public writes, false confirmation/cancel/trace links, headless sharing,
all-state gallery (6.16), unsupported quota/actor/duration/retention/resilience/ZDR claims or hardcoded
artboard values. No fabricated MarketEvidence/citations/model explanation. Integration never uses
Node test/assert, fetch, child_process, custom assertions, unsafe types or a manual process harness.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Prepared completion | Catalogue queued grant, thread/run and actual SSE | queued/running/completed, exact received BRL/m², operands/time/steps and synthetic origin; one terminal | GET snapshot cannot overwrite a later frame; no write/model |
| Draft/place | Matching navigation draft, invalid/mismatched state, place change | Editable escaped unsent draft; separate follow action never submits it; navigation geography not claimed as fixture analysis | Invalid ID starts no invalid place read; real 404/no context handled safely |
| Missing evidence | No citations/model prose/quota/trace/step actors in prepared DTO | Explicit localized absence; explanation section never claims generation; only returned availability intents | No invented source link, Jev, timing, token count or live/durable claim |
| Framing/validation | Split UTF-8/CRLF/CR/LF, comments, multiple/multiline data, malformed or foreign frames | Incremental bounded parser; transport id/event agrees with parsed envelope; exact run/thread and next sequence | Fail sanitized on wrong identity/version/gap/reorder/conflicting duplicate/post-terminal; never leak raw body/grant |
| Interrupted stream | Nonterminal EOF, stalled response/body/next complete frame | Keep last accepted snapshot/cursor; one bounded automatic resume using Last-Event-ID then manual recovery | Ten-second whole JSON and next-frame deadlines abort/release work; no invented business terminal |
| Replay/terminal | Exact duplicate of validated frame, replay strictly after cursor, explicit terminal | Deduplicate exact repeats; no rollback or duplicate announcements; terminal stops/release and never reconnects | Empty replay accepted only after known terminal; otherwise interruption |
| Read/authority failure | 401/403/404/503/network/invalid JSON, optional valid public UUID | Shared localized safe failure, retained place/run and explicit recovery; authority isolation | No automatic ordinary-read retry or repeated authority failure; only validated request ID visible |
| Ownership/lifecycle | Rapid follows, navigation/unmount, locale switch, old async reply | Abort obsolete subscription/read/timers, no stale replacement; locale formats existing facts without execution | Cancellation is transport-only, never business cancellation; no leaked streams/cache authority |
| History/unavailable | Earlier thread unavailable-intent run, null result | Inspect actual recorded question/state; genuine manual Search recovery; no price for unavailable result | No invented thread creation or retention guarantee; completed-only scope |
| Locale/reflow/a11y | PT/EN at390/960/1440, long question/evidence, reduced motion | Exact amounts, readable wrapping/focus, working keyboard/disclosures, zero overflow and full-page axe | Record incompletes/manual limits, no blanket WCAG/fidelity claim from gates |

</intent-contract>

<!-- prettier-ignore-end -->

## Code Map

- `packages/contracts/src/ask/ask.read.types.ts`, `ask.read.dto.ts`, `ask.sse.dto.ts` — prepared
  AskRun/Thread/Availability/FixtureCatalogue/ProgressEvent and exported parsers. Keep unchanged.
  Steps are phase/sequence/at, not the illustrated six actor/duration nodes. Result carries its own
  inputs/computedAt. Availability names only price_per_square_meter and unavailable.
- `packages/infrastructure/src/ask/synthetic-ask.adapter.ts`, `apps/api/src/ask/ask.controller.ts` —
  read-only reference: GET capabilities/fixtures, authenticated run/thread/events; fixed snapshots
  independent of finite stream. queued preview sequences1–3 completes with1000000 minorUnits/m²
  from80000000/80; assert against independent API, never hardcode UI values. Earlier thread
  completed unavailable-intent result is real fixture history. Public grant is scope
  synthetic-fixture. Do not mix AskLiveRun or ModelExplanation into this prepared basis.
- `apps/web/src/api/client.ts` — reusable ApiReadError/publicRequestId conventions; ordinary helper
  lacks Bearer. Build `ask/ask-client.ts` without widening other clients. Named policy: JSON
  deadline10000ms including body, next-frame deadline10000ms (comments do not renew it), max
  automatic reconnect1, max frame64KiB/max buffered128KiB, redirects refused. Fetch is allowed here
  in product code. ReadableStream/TextDecoder lifecycle belongs to screen-local reader.
- `apps/web/src/ask/ask-stream.ts`, `ask-session.ts` (new) — incremental framing plus session
  ownership/replay. Cursor changes only after complete validated frame. Exact duplicate is harmless
  only when identical; same ID/different snapshot is corruption. Require immutable
  run/thread/question/original inputs/basis identity and contiguous increasing sequence, allow
  legitimate progressing snapshot fields. Terminal is authoritative; EOF is not. Bound memory,
  propagate abort identity, remove listeners/timers and release/cancel reader on every exit.
- `apps/web/src/shell/PlaceEntry.tsx`, `routes.tsx`, `shell/AppShell.tsx` — old Ask placeholder,
  route and preserved shell. Replace Ask route with `AskScreen`, keyed by validated place. Reuse
  placeQuery/disabled catalogue for actual place, safe missing/retained/error treatment. Keep
  Search/Places/Ask only and shell current destination. Do not rewrite shell composition globally.
- `apps/web/src/places/PlaceQuestion.tsx`, `properties/PropertyPlate.tsx` —
  `{placeId,questionDraft}` navigation-state handoff; preserve escaping/trim/mismatch/no-write
  guarantees. Incoming draft initializes editable local draft, never triggers a run or gets replaced
  by the fixed question.
- `apps/web/src/places/locale.ts`, `resources.ts`, `ask/ask-resources.ts` (new) — bundled ask
  namespace already exists; replace placeholder copy with typed paired catalogues while preserving
  legacy test-only PlaceEntry behavior where still mounted. Formatting comes from formatters.ts;
  formatExactMoney takes minorUnits, Figure/Provenance require MarketEvidence and cannot be faked.
- `apps/web/src/ask/AskScreen.tsx`, `AskRunRecord.tsx`, `AskThread.tsx` (new) — separate geographic,
  session and presenters. Local editable draft with clear unsent label; separate real button follows
  the prepared queued example, never an Ask submit falsely consuming the text. Initial visit does
  not auto-execute/follow; follow action loads selected example and stream. Record can inspect
  earlier unavailable history then return to current without losing streamed completion. Query
  caches ordinary reads; scope authority-dependent keys by opaque session identity rather than
  putting capability/question in keys, clear those reads when session authority changes.
- `apps/web/src/styles/components.css`, `place.css`, new `styles/ask.css` and stylesheet entry —
  reuse ask/fig/note/st/steps/gate/slots/kv/panel/band, scoped responsive extension only. PlacePlate
  children accept header composer. Use semantic known record times; unavailable fields stay words.
- `docs/design/canvas/project/Ask.dc.html`, `DesktopAsk.dc.html` — authored390x2034/1440x1142.
  Completion bands/figure/note/steps/history are authority for appearance, not factual fixture data.
  Desktop confirmation panel, future nav and unsupported telemetry are D-066 exceptions.
- `integration/web-listing.integration.test.ts`, `support/fixture.ts`, `search-campaign.ts`,
  `http.ts`, `accessibility.ts`, `property-capture.ts` — reuse actual production Compose,
  exact-label ownership, source/local/runtime artifact identity, immutable formatted evidence
  copy/hash, Supertest oracles, local-only sandboxed Chromium, full-page axe and asserted
  scroll-zero capture. `integration/ask-contracts.integration.test.ts` proves prepared API
  oracle/replay/no SQL writes. Add only Ask/DesktopAsk to the fixed reference allowlist in
  apps/web/vite.config.ts.

## Tasks & Acceptance

**Execution:**

This worker is the implementation phase of the owner's explicitly selected, already active
`bmad-build-auto` full route, not a new build invocation. Parent planning/exploration are complete;
parent owns the subsequent verification, reviews and orchestration. Execute the tasks below directly
from this plan; do not start a second `bmad-build`/`bmad-build-auto` workflow or delegate again.
This clarifies the active workflow boundary, not permission to bypass any failing check in it.

- [x] `apps/web/src/ask/ask-stream.test.ts`, `ask-client.test.ts`, `ask-session.test.ts` — first add
      failing tests for every transport/replay/deadline/ownership matrix row; implement focused
      modules green. Use real Response/ReadableStream chunks and fake timers/abort observation;
      prove whole-body stall and incomplete-frame comment trickle timeout, cleanup and one reconnect
      ceiling. Example: deliver sequence1, disconnect, assert reconnect Authorization unchanged and
      Last-Event-ID exactly its admitted ID, then sequences2/3 yield supplied result once. Replaying
      sequence1 with mutated question or same id/different bytes must reject safely. No Math
      division.
- [x] `apps/web/src/ask/AskScreen.test.tsx`, `AskRunRecord.test.tsx`, `AskThread.test.tsx` — add
      failing visible-behavior tests with isolated router/cache/locale, then implement
      screen/presenters, resources and scoped styles. Verify draft-only entry/no automatic follow,
      explicit example action, PT/EN result/inputs/time, origin/explanation absence, actual history
      selection, failed reads/manual recovery, no result on progress, cancellation and locale
      preserving facts. Keep test assertions meaningful; update predecessor route/draft tests only
      for intentional new surface behavior.
- [x] `apps/web/src/routes.tsx`, `places/resources.ts`, stylesheet entry, `vite.config.ts` and
      affected `shell/PlaceEntry.test.tsx`, `shell/AppShell.test.tsx`, Overview/Property draft tests
      — wire genuine Ask route and reference allowlist, preserve navigation/place/error/draft
      guarantees. Test old-place abandoned reads and no secret/question in URL/storage/diagnostics.
- [x] `integration/web-ask.integration.test.ts`, focused `integration/support/ask-web-*.ts` helpers
      — real unique owned postgres/migrations/api/web, explicit non-secret fixture env, no worker/AI
      required. Parse actual capabilities/catalogue/thread/run/finite SSE independently through
      Supertest. Native browser follows actual prepared stream; compare exact terminal/result/steps.
      Test PT/EN390/960/1440, draft entry from Overview/Property, history, faulted GET/SSE header
      replay, retained state/recovery, navigation abort and no writes/provider/font-host requests.
      Transport fault injection must not synthesize business data or masquerade as live durable
      recovery. Save SQL effect digest/count comparison if asserting no mutations. Use Vitest
      expect/poll/waitFor, Testcontainers-owned shared lifecycle, no forbidden integration harness
      or unsafe types.
- [x] Same campaign/support — write scenario .feature/catalogue and immutable attempts with exact
      source/served image+asset/local build/backend identities; capture valid full/top/regional
      views after fonts/reduced motion/scroll-zero and geometry/keyboard/axe/no-overflow/44px
      proofs. Capture both fixed authored references with local fonts and source hashes. Format
      evidence JSON before hashing via copySurfaceEvidence; own teardown receipt must be true,
      foreign resources preserved.
- [x] This plan — append changes, exact commands/results, red/green evidence, surprises and limits;
      keep intent-contract immutable. Report any incomplete requirement, no self-acceptance/commit.

**Acceptance Criteria:**

- Given the actual isolated stub API and no browser execution, when the visitor explicitly follows
  the prepared queued example, then the browser consumes its stream to completed and presents the
  independently verified result, recorded inputs/steps/time, synthetic origin and clearly
  unavailable market citations/model explanation, without a write, model call or invented terminal.
- Given an editable draft arriving from Place/Property, when visiting, switching locale/place or
  following the example, then the draft stays separate and unexecuted, the plate stays geographic
  navigation only, and neither draft nor capability enters URL/storage/logs.
- Given interrupted or corrupted transport, when recoverable or manually resumed, then last
  validated evidence stays readable and cursor/identity rules prevent stale or foreign overwrites;
  deadline/cancellation releases owned work and terminal never reconnects or regresses to fixed GET.
- Given both locales at all target widths, when using keyboard, evidence disclosures, thread
  selection and real recovery, then actions work with visible focus/44px targets, text/values remain
  readable without page overflow, and full-page axe has zero violations with limits recorded.
- Given the authored references and D-066 exceptions, when parent compares settled captures side by
  side, then the existing Placa composition is preserved; finite finish review and documentation
  complete before acceptance, without claiming literal fidelity from a passing test suite alone.

## Implementation Notes

The first isolated worker returned before edits after mistakenly starting a separate `bmad-build`
invocation. That renderer halted on a hash mismatch in an older ignored snapshot. A read-only
comparison found Markdown whitespace changes in its edge-case prompt; six outputs differ from its
manifest. The active `bmad-build-auto` snapshot is distinct. No cache, manifest, installed skill or
shared script was modified, no validation was disabled, and no source verification was claimed.
Setup status reports current module copies but stale shared scripts; installation maintenance is not
part of this screen. The worker boundary above makes the owner's selected orchestration explicit.

### Implementation checkpoint — 2026-10-22

Implemented screen-local bounded JSON/SSE transport, incremental UTF-8 framing, immutable run
identity and ordered replay admission, ten-second whole-body/next-frame deadlines, one interruption
resume, deterministic cancellation/reader release, and sanitized failures. Complete envelopes are
admitted individually even when later bytes in the same chunk corrupt. Credentials stay in headers
and transient owned state, never query keys, URLs or diagnostic files. Terminal evidence cannot be
replaced by a subsequent fixed GET.

Implemented the genuine Ask route with an editable unsent state-only draft, explicit
prepared-example following, real current/history selection, exact received
money/inputs/timestamps/steps, availability, origin/identifier disclosure, and explicit absence of
model prose and market citations. PT/EN copy and Ask-scoped CSS preserve Placa. D-067 binding is
shown independently of navigation; a null-input component test proves genuinely unbound
presentation. Added only Ask/DesktopAsk to the existing development reference allowlist. Updated
predecessor tests only for the replaced placeholder. Backend, contracts, migrations, dependencies,
authored artboards and incumbent global design files are unchanged.

Red/green evidence: transport tests first failed on the absent three modules; the first green
transport run passed 38 tests. Presenter/screen tests first failed on absent presenters/old route
behavior; the first complete Ask run passed 59 tests. Full web initially failed ten obsolete
placeholder/draft assertions; their new visible-behavior expectations pass. Additional same-chunk
corruption, lookalike content type, non-cooperative cancellation and D-067 tests bring the focused
suite to **7 files / 63 passing tests** (`--reporter=verbose`, 2026-10-22 06:44 UTC runner time).
Imported fixture self-tests are discovered normally, not excluded.

Focused covering test names/results (every parameter row passed):

- `accepts split UTF-8 and %j separators, comments and multiline data` (LF, CR, CRLF);
  `accepts multiple complete frames and ignores keepalive comments`;
  `rejects malformed, conflicting or oversized frames without exposing data` (six rows);
  `bounds incomplete buffering, rejects invalid UTF-8 and unfinished data at EOF` — PASS.
- `keeps contiguous snapshots and exact duplicates without duplicate announcements`;
  `rejects changed immutable %s and retains last evidence` (question, threadId, placeId,
  originalInputs, basis, metadata, principalId, locale, createdAt);
  `rejects conflicting duplicate bytes, gaps, reordering, rollback and post-terminal` — PASS.
- `resumes once with unchanged authority and last admitted event ID, completing once`;
  `deduplicates replay, never reconnects a terminal and accepts no empty nonterminal replay`;
  `sanitizes HTTP %i, validates request IDs and never repeats authority failures` (401/403/404/503);
  `retains evidence on malformed/foreign/gapped frames and does not retry corruption`;
  `retains complete evidence before malformed bytes in the same network chunk`;
  `rejects a lookalike stream media type without admitting evidence` — PASS.
- `times out a stalled JSON body at ten seconds, aborts and releases its reader`;
  `does not wait for an uncooperative underlying cancel to release a timed-out reader`;
  `does not let incomplete frames and comment trickle extend next-frame deadlines`;
  `bounds stalled response headers and at most one automatic retry`;
  `propagates cancellation identity, releases streaming work and never reconnects`;
  `parses JSON through strict public contracts, rejects invalid JSON and preserves valid request IDs`
  — PASS with real Response/ReadableStream bodies and fake timers.
- `shows exact returned result/inputs/time and explicit evidence absence in %s` (PT/EN);
  `preserves the returned synthetic binding independently of navigation geography`;
  `shows no result while progressing and no price for unavailable history`;
  `selects actual recorded history and current evidence with native buttons` — PASS.
- `keeps editable escaped unsent draft separate from explicit example following and locale changes`;
  `inspects unavailable history then returns to streamed completion without fixed-GET rollback`;
  `sanitizes failed reads and manually recovers without automatic authority retry`;
  `retains interrupted evidence and manually resumes with cursor instead of replacing with GET`;
  `aborts obsolete streams and clears authority-scoped ordinary cache on unmount`;
  `ignores invalid or mismatched draft state %j` (four rows); `rejects invalid place before HTTP` —
  PASS with isolated router/cache/locale.

Actual commands completed at this checkpoint:

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — PASS (all eight
  workspaces; web 36 files / 450 tests). The existing >500 kB build advisory remains non-fatal; no
  chunk threshold was changed.
- `pnpm run test:coverage` — PASS twice, including after final transport changes; unchanged
  80/80/80/75 workspace floors. No exclusion or threshold change.
- `pnpm --filter @rei/web exec vitest run --dir src src/ask --reporter=verbose` — PASS, 63 tests.
- `pnpm run test:integration:list` — PASS; the new real Ask browser campaign is discovered.

The owned browser/contract campaign results and immutable evidence will be appended after actual
execution; none are claimed by the unit/build checkpoint above. Parent still owns the prescribed
finite visual review, detector, fresh finish reviewer/documenter and BMAD review/acceptance.

### Implementer verification handoff — 2026-10-22

Added `integration/web-ask.integration.test.ts` and `integration/support/ask-web-evidence.ts` using
the existing shared owned-fixture, HTTP, capture, accessibility and immutable-copy helpers. The
campaign runs real production PostgreSQL/migrations/API/web with a unique project and explicit
non-secret fixture configuration, no worker or AI. Its independent public-parser oracle verifies
actual queued/running/completed envelopes, exact terminal/result/inputs/steps/timestamps, the D-067
binding and actual unavailable history. Transport faults truncate actual response bytes or malform
only the transport; they do not fabricate business results. Browser assertions cover both native
draft handoffs, private unsent editing, locale preservation, place reset, sanitized read
failure/manual recovery, automatic cursor replay once, corrupted-stream retained evidence/manual
replay without GET rollback, and navigation abort observed before releasing the held response.

The passing campaign is
`apps/web/.impeccable/review/campaigns/ask-2026-10-22T10-05-57-103Z-0c634c27/`. Its Vitest
invocation passed **1 test / all 7 declared scenarios** in 64.49 seconds. The campaign and teardown
receipts report complete, all owned resources removed, and foreign resources preserved. The final
SQL count/digest comparison covers **47 tables, all unchanged**. Browser traffic stayed on the owned
origin, had no non-GET API requests and made no font/provider request.

The manifest contains **54 immutable files**, including full/top/record/thread captures for the
completed PT/EN 390/960/1440 matrix, history and interrupted evidence, the failed-read surface, and
both fixed authored references at 390×2034 and 1440×1142 with source hashes. Nine full-page axe
reports have **zero violations and zero incompletes**, without exclusions. Settled captures record
loaded self-hosted fonts, reduced motion, scroll-zero starts, visible keyboard focus, no horizontal
overflow and all visible interactive targets at least 44×44px. A separate post-run SHA-256 audit
re-read all **54/54** manifest files successfully. The parent must still open and compare these
captures; automated success is not visual acceptance or a blanket accessibility claim.

Identity is explicit rather than assumed: `version.json` records baseline
`b5fc8d3b1d3a186249c0f7b0257cdbd91a593250`, the dirty candidate's twelve-file Ask source hash
`2ce6f35b03ec5856a0a7a6637891b4e3a9ecdaf959beb2c150d54ad5ae5b5583`, exact owned web/API image IDs,
separate host-build and runtime JS/CSS hashes, and backend artifact hash. `served-assets.json`
verifies every deployed JS/CSS asset over HTTP against the exact owned runtime filesystem and
independently matches every browser-loaded asset. Host and Docker JS bundles have different
filenames/hashes, while CSS agrees; cross-environment byte reproducibility is **not** claimed or
required for this semantic campaign. No assertion equates those different artifacts.

Historical failed campaigns remain preserved, never rewritten as passing evidence:

- `09-42-08-184Z-1f529287`: oracle initially expected a boolean run terminal, while the contract
  returns the exact terminal object. Corrected the oracle, not the contract or product.
- `09-50-34-784Z-edaf45ff` and `09-57-58-276Z-670df146`: independent expectations initially missed
  the existing formatter's normalized BRL spacing in PT and then EN. Corrected the oracle only.
- `09-52-45-731Z-95171a35`: real 32.0625px breadcrumb target width, despite 44px height. Fixed with
  `.ask-screen .place-head .crumbs a { min-width: var(--target); }`; no global style change. All
  product gates/coverage and the passing browser matrix were repeated afterward.
- `09-59-20-292Z-975448b7`: immediate post-click assertion sampled the previous route before React
  Router committed. Added exact-URL waiting and state polling; draft comparisons report booleans
  rather than printing draft contents on failure.
- `10-00-37-413Z-b9d8d2d1`: all seven scenarios passed, but an over-strong artifact check assumed
  the browser must request the unused lazy CityScene chunk. Added independent HTTP artifact reads.
- `10-03-38-230Z-8a0233ee`: all seven scenarios passed, but host-build filenames were incorrectly
  treated as Docker filenames. Adopted the existing Listing campaign's exact-runtime enumeration and
  separate host identity model. Final HTTP/runtime/browser byte comparisons all pass.

Each failed campaign has a clean owned-resource teardown and preserves foreign resources. No failure
was skipped, converted to a green attempt, or hidden by weakening a threshold, parser, product
contract or assertion about the behavior actually exercised.

Actual final checks after the last source/test-harness changes:

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — PASS; all eight
  workspaces, **2,584 tests** total (web **36 files / 450 tests**). Existing >500kB build advisory
  remains; no threshold was changed.
- `pnpm run test:coverage` — PASS again, all eight unchanged workspace floors. No new exclusions.
- `pnpm --filter @rei/web exec vitest run --dir src src/ask --reporter=verbose` — PASS again, **7
  files / 63 tests**, with covering names/results listed at the earlier checkpoint.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/web-ask.integration.test.ts`
  — PASS, final campaign above, all seven declared scenarios and true cleanup receipts.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/ask-contracts.integration.test.ts`
  — PASS unchanged, **2 tests**, including seven prepared API SSE journeys, authority/security,
  replay, full thread and edited-confirmation preview; zero SQL effects.
- Scoped Prettier, ESLint and `pnpm run typecheck:integration` — PASS after the final harness edits.
- `pnpm run test:integration:list` — PASS again; the real Ask browser campaign and both unchanged
  prepared-contract tests are discovered, without skips or an empty success.
- `git diff --check` — PASS. Backend/contracts/migrations/dependencies/artboards/global design files
  remain untouched by this implementer; no branch, commit or push was created.

Remaining parent-owned work: independent diff/matrix verification; bounded visual/artboard
inspection; one detector; fresh context-free finish reviewer and documenter; required BMAD review;
acceptance/ticket state and any authorized commits. Human screen-reader pronunciation/order,
daylight focus and zoom remain manual limits, not proven by axe or geometry. Live execution, model
prose/citations and durable browser replay remain deliberately outside this prepared read-only
screen. This handoff is implementation evidence, not self-acceptance.

### Parent Verify correction — cleanup receipts, 2026-10-22

Parent Verify found that the browser harness marked the campaign complete before cleanup and
unconditionally wrote a successful teardown receipt after a rejected `fixture.down()`. Replaced that
arrangement with a focused `runAskCampaign` wrapper around the existing tested `runSearchCampaign`
lifecycle. Work and all resource releases precede completion; owned removal and its timestamp are
recorded only after actual successful owned down. Foreign inventory is still independently checked
after down failure, and reporting still runs after inventory failure. Primary, release, down,
inventory and reporting failures retain their aggregate error structure. The receipt reports
independent confirmed facts: failed work does not erase successful owned removal, and an
unsuccessful foreign check cannot claim preservation or overall completion. The teardown and
campaign writes also preserve either write failure while attempting both files.

Focused deterministic self-tests cover rejected down producing only `failed`/false/null removal, all
five failure sources surviving together, confirmed down after work failure, successful completion,
and foreign-check failure retaining owned removal without claiming preservation. No
product/UI/backend code or historical campaign evidence was changed. The parent's passing
`ask-2026-10-22T10-14-56-415Z-44cb0bea` remains historical evidence; the parent owns the new full
gates and real browser campaign after this harness-only correction.

Actual focused verification for this correction:

- Focused lifecycle command:

  ```sh
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/support/ask-campaign.test.ts integration/support/search-campaign.test.ts
  ```

  — PASS, **2 files / 9 tests** (five new Ask lifecycle cases and four existing Search cases). New
  covering names:
  `a rejected owned down writes a failed outcome, never a successful removal receipt`;
  `work, resource releases, down, inventory and reporting failures all survive`;
  `successful owned teardown remains a separate fact when work fails`;
  `only successful work, releases, down and foreign inventory report complete`;
  `a foreign inventory failure writes failed without erasing confirmed owned removal`.

- Scoped ESLint for the three touched integration TypeScript files — PASS.
- Scoped Prettier for the three integration files and `git diff --check` for those files and this
  plan — PASS. A whole-plan format check also flagged its pre-existing checklist indentation; that
  unrelated section was preserved unchanged, outside this correction's permitted note edits.
- No wider tests, full gates, Compose run or browser campaign was executed in this correction, as
  directed by the parent; those remain parent-owned verification.

### Final parent verification after both corrections — 2026-10-22

Parent independently passed the exact root lint/typecheck/test/build chain after the cleanup and
running-class corrections: **2,585 tests** across eight workspaces, including web **451**. Coverage
passed unchanged floors; focused Ask verification passed **7 files / 64 tests**, including the new
running-status regression. Integration discovery passed, lifecycle self-tests passed **9 tests**,
prepared contracts passed **2 tests**, and the actual owned browser campaign passed all **7
scenarios**.

The final immutable campaign is
`apps/web/.impeccable/review/campaigns/ask-2026-10-22T10-27-15-811Z-81622909/`, source hash
`54cd3a423423a1032fbf03cb49d35b539d9929108d4edc4c24ac85aca80174de`. Parent independently verified
all **54/54** manifest hashes, all **47** unchanged SQL table counts/digests, and no owned
containers or volumes left under the exact campaign label. Parent read all **18**
accessibility/interaction reports and opened all **36** current PNGs, comparing the completed
locale/width matrix and history/interrupted/failure states with the fixed authored references. All
nine accessibility reports have zero violations/incompletes; interaction records confirm loaded
fonts, zero overflow, scroll-zero capture starts and at least 44px targets. The running badge is
visibly corrected. This closes parent visual round **2/2**, with no new material correction. The
single prior detector returned `[]` and was not rerun. Matrix audit and the command history are in
`apps/web/.impeccable/review/ask-parent-verification.md`; independent finish/documentation
confirmation and BMAD review remain separate gates, not implied by tests. The final independent
finish confirmation subsequently returned `ship` after opening all 36 current PNGs and reading all
18 reports; its five contract sections are in `ask-finish-review.md`. The final documenter
confirmation resolves both historical observations and preserves DESIGN.md/design.json unchanged.
Parent read both complete records and verified the finish contract before entering review.

### Review loop 1 re-derivation — implementer, 2026-10-22

Loaded this complete plan and every frontmatter context file, then restored the scoped positive
preservation patch as the authorized starting material. Preserved the authored composition, both
locales, synthetic binding, running-status correction, breadcrumb sizing, unsent draft boundary,
read-only oracle, deadlines/recovery and failure-preserving campaign teardown. No nested BMAD
workflow, delegation, design round, detector, branch, staging, commit or push was performed.

Addressed all four corrections:

- R1 — the decoder scans incoming bytes once for ASCII line separators and fatally decodes each span
  incrementally. Complete public envelopes invoke admission before a later malformed span can throw.
  LF, CR and CRLF work across transport partitions, including split code points and incomplete EOF.
  Line fragments are joined only when the line completes, without growing-buffer rescans. The 128
  KiB incoming-chunk and 64 KiB raw-frame bounds remain enforced. A blank CR reserves its optional
  LF before immediate admission; other CRLF bytes are counted when received. The transport still
  cancels/releases corrupt bodies without an automatic corruption retry.
- R2 — added local typed comparisons for every returned run identity, input, metadata, step,
  decision, confirmation, result and terminal field. GET/thread and immutable/prefix comparisons now
  ignore object member insertion order while retaining array order and rejecting actual changes.
  Same-ID duplicate admission still compares the exact serialized data bytes separately. Public
  parsers and contracts remain unchanged; there is no new dependency or public API.
- R3 — read Impeccable craft-floor immediately before the UI edit. Replaced only Ask's approximate
  area presentation with locale-specific number formatting at 21 significant digits, preserving the
  received finite numeric operand, including subnormal positive values. No business result is
  recalculated, no shared formatter/CSS/token/artboard is changed, and the prepared integer operand
  retains its appearance. This is a factual presentation repair, not an additional polish round.
- R4 — added a tested Ask-attempt lifecycle using the existing `preserveCleanup`/`cleanupAll`
  primitives. Original action errors, including falsy thrown values, survive; screenshot,
  environment, readback and ledger are attempted independently and subsequent errors aggregate.
  Required evidence failure cannot produce an approved attempt. Ledger references identify only
  successfully produced evidence. Draft masking/redaction and capability omission remain intact;
  unsafe raw failure messages remain in runner output, not diagnostic artifacts.

Red/green evidence: the added R1/R2/R3 tests first produced 12 failures across four focused files
(valid-prefix loss, CR EOF, nested semantic identity, reordered GET/thread and six exact-area rows).
The attempt test first failed because its helper did not exist. A further CRLF-byte-accounting
regression failed before correction, then passed. No assertions, parsers, coverage floors or
exclusions were weakened. The final focused Ask run passes **8 files / 87 tests**; the focused
attempt/campaign/Search lifecycle run passes **3 files / 18 tests**.

Additional covering names/results, supplementing the unchanged passing matrix listed above:

- `retains queued/running before invalid UTF-8 with %j in every chunk partition` — PASS for LF, CR
  and CRLF, each with same-chunk, split-invalid-code-point, prefix/suffix and bytewise variants;
  `retains complete %j frames before an unfinished UTF-8 code point at EOF` — PASS for all three;
  `includes both bytes of CRLF in the frame ceiling across chunk partitions` — PASS for same-chunk
  and bytewise delivery;
  `retains and announces the valid prefix before a fatal UTF-8 suffix without reconnecting` — PASS,
  retaining the running snapshot/cursor and confirming reader cancellation/release.
- `accepts public-parser-valid reordered nested identity and progressing step members`;
  `accepts reordered decision/confirmation and rejects real nested changes`;
  `matches separately serialized valid %j records with reordered nested fields` (queued, running,
  completed-price and completed-unavailable);
  `rejects absent history and real independently valid changes to returned facts`;
  `follows when separately serialized GET and thread snapshots reorder nested members` — PASS.
  Existing exact conflicting-duplicate, immutable-change, gap/reorder/rollback/post-terminal and
  fixed-GET-no-rollback tests also remain green.
- `preserves exact received area in %s for %s` — PASS in PT/EN for 80.125, 0.0001 and
  Number.MIN_VALUE, each through accepted public runs with the unchanged returned result;
  `uses the incumbent running status class for a received running record` — PASS.
- `preserves falsy action failure %j and records a failed attempt` — PASS for undefined, null,
  false, zero and empty string;
  `failed work and a closed page screenshot still attempt readback/environment and ledger`;
  `preserves primary, multiple capture/write errors and ledger failure together`;
  `successful action with failed required evidence is never approved`;
  `only successful action and all required captures permit an approved ledger entry` — PASS. All
  five Ask campaign-teardown and four existing Search lifecycle cases remain green.

Commands completed after the final decoder correction:

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — PASS, including
  integration type checking, **2,608 tests** across eight workspaces; web **37 files / 474 tests**.
  The existing >500 kB build advisory remains non-fatal and unchanged.
- `pnpm run test:coverage` — PASS, all eight unchanged 80/80/80/75 workspace floors. Web totals:
  statements 96.20%, branches 90.51%, functions 96.99%, lines 97.29%.
- `pnpm --filter @rei/web exec vitest run --dir src src/ask` and the same command with
  `--reporter verbose` — PASS, **8 files / 87 tests** in each run.
- Focused attempt/lifecycle command:

  ```sh
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/support/ask-attempt.test.ts integration/support/ask-campaign.test.ts \
    integration/support/search-campaign.test.ts
  ```

  — PASS, **3 files / 18 tests**.

- `pnpm run test:integration:list` — PASS; the actual browser campaign, both prepared-contract cases
  and all attempt failure cases are discovered, with no skip or empty-success substitution.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/web-ask.integration.test.ts`
  — PASS, **1 test / all seven declared scenarios**, 94.71 seconds including owned production image
  build, services, Chromium and teardown.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/ask-contracts.integration.test.ts`
  — PASS unchanged, **2 tests**, 116.29 seconds including owned fixtures. Seven prepared API SSE
  journeys, authority/security, replay, complete history and edited-confirmation preview retain
  their zero-SQL-effects and exact owned/foreign cleanup checks.
- Scoped Prettier and `git diff --check` — PASS. Backend/contracts/migrations, dependencies,
  authored artboards, global design/system files and other surfaces' formatters remain untouched.

Fresh immutable campaign:
`apps/web/.impeccable/review/campaigns/ask-2026-10-22T10-49-32-900Z-3c739afd/`. The baseline remains
`b5fc8d3b1d3a186249c0f7b0257cdbd91a593250`; the repaired dirty candidate's **13-file source hash**
is `c1555e9c69ec1fee8096f34278537817ff92c224e2a5746aa087d96b81fa4182`. Version records distinguish
host-build assets, exact owned runtime assets/images and backend artifact identity. Every served
JS/CSS hash matches its actual runtime artifact; host and runtime JS builds differ and are
explicitly not claimed reproducible. The CSS hash is unchanged.

Independent post-run readback recomputed that source hash, verified **54/54** manifest files and
every required attempt evidence reference, checked seven approved scenario entries, and compared all
**47** SQL table counts/digests unchanged. Nine accessibility reports have zero violations and
incompletes; nine interaction reports confirm loaded local fonts, no horizontal overflow and 44px
minimum targets. The complete receipt independently confirms owned removal and foreign preservation;
exact project-label checks found no remaining owned containers or volumes under
`rei-web-ask-17ee8f5e-11a3-4efe-9e15-4755b7a4c2ee`.

Historical campaigns/reviews remain immutable history, not acceptance of this repaired source. Of 36
refreshed PNGs, 33 are byte-identical to the prior 10:27 campaign. Three differ in hash:
`ask-completed-390-pt-BR.png`, `ask-completed-390-en.png` and `ask-completed-390-en-top.png`. Hash
differences alone are not a visual finding or a fidelity claim. The parent owns the bounded
factual/source/artifact confirmation, refreshed finish/documenter evidence, independent gates and
BMAD review/acceptance; no new detector or visual polish round was opened. Human screen-reader,
daylight focus and zoom limits remain, as do the deliberately prepared/read-only/non-durable scope.

## Plan Change Log

- Review loop 1 — preserve and re-derive transport/presentation/evidence correctness. The complete
  attempted product/test change is saved reversibly in
  `.ignore/ask-positive-preservation-2026-10-22.patch` (repository-relative); all immutable campaign
  evidence and review documents remain in place. KEEP the working Placa composition, both locale
  catalogues, running-class correction, scoped 44px breadcrumb correction, read-only actual
  Pinheiros binding, unsent draft separation, exact minor-unit result, deadlines and ownership, one
  automatic cursor resume, no fixed-GET rollback, actual browser oracle/artifact identity,
  failure-preserving owned teardown and all existing tests. Restore these preserved code changes as
  the starting material for re-derivation, then address every correction below; this is not a new
  feature, design tournament or authority expansion. Historical passing captures remain historical,
  not proof of the repaired candidate. Do not edit the immutable intent-contract.
- R1: the byte decoder treated an entire transport chunk as one fatal UTF-8 decode. A trailing
  invalid byte prevented complete preceding frames from being admitted. Re-derive incremental
  decoding so complete valid envelopes commit before any later malformed UTF-8, independent of
  network chunk boundaries, including LF/CR/CRLF and split code points/EOF. Keep strict fatal UTF-8,
  size limits, safe errors and validated cursor; do not replace invalid bytes or introduce quadratic
  rescans. Add failing regressions for valid queued/running envelopes followed by malformed UTF-8 in
  the same chunk and partitioned variants, proving retained snapshot/cursor.
- R2: raw JSON.stringify comparisons treated object member order as semantic identity. Re-derive
  typed semantic comparisons for initial GET/thread equality and immutable/session-prefix checks,
  including nested inputs, metadata, steps, decision and confirmation. Preserve array order and
  reject real value/identity changes. Keep byte-exact same-ID duplicate/conflict detection distinct
  from semantic comparisons across separately serialized snapshots. Add failing public-parser-valid
  reordered-key cases for GET/thread/SSE and nested progressing evidence; keep conflicting duplicate
  and changed-value rejection tests. Do not weaken parsers or add a dependency/public API.
- R3: the shared approximate quantity formatter rounds valid area inputs. Use Ask-local exact
  localized number presentation that preserves the received numeric area, including 80.125 and
  positive tiny values such as 0.0001, rather than showing a different operand or zero. Do not
  recompute the business result, change the wire contract, or alter other surfaces' formatters. Add
  PT/EN presenter regressions using accepted runs and exact operands; retain integer-fixture
  appearance. Read craft-floor immediately before the UI edit. This is a factual correctness repair,
  not another design/polish round.
- R4: scenario evidence capture could throw before rethrowing the action failure and before
  recording the attempt. Re-derive a tested Ask attempt lifecycle using shared failure-preservation
  primitives: preserve the primary action error (including falsy thrown values), attempt independent
  screenshot/readback/environment captures and the ledger even after earlier evidence failure,
  aggregate subsequent failures, and never record an approved attempt if work or required evidence
  fails. Keep draft/authority redaction and truthful references to actually produced evidence. Add
  focused deterministic Vitest failure-path tests, including page/screenshot failure after failed
  work, multiple capture/write failures, and successful work with failed evidence.
- Verification after loop 1: rerun every command below after all corrections, including actual
  prepared contracts and a fresh immutable browser campaign, plus the new attempt-lifecycle tests.
  Record current source/artifact hashes and SQL/teardown truth. The bounded visual round 2 and
  single detector are finished: do not reopen polish, run a second detector or change the design.
  Integer prepared-fixture appearance must remain unchanged; parent/documenter/finish reviewer
  recheck the corrected source, refreshed artifact identity and any changed visible facts only. Do
  not present the old visual/source hash as the repaired candidate.
- Parent review running-status correction: read Impeccable craft-floor immediately before the UI
  edit and changed only the received `running` class mapping from undefined `st--run` to incumbent
  `st--running`. Added `uses the incumbent running status class for a received running record`; it
  failed first on `st--run`, then passed after the mapping correction.
  `pnpm --filter @rei/web exec vitest run --dir src src/ask/AskRunRecord.test.tsx` — PASS, **1 file
  / 6 tests**. Scoped ESLint, Prettier and diff whitespace checks pass. No CSS/token/design change,
  detector, new visual evidence, staging or commit; existing captures remain historical, with
  current-source bounded confirmation and full verification owned by the parent.
- Parent Verify cleanup-receipt correction: completion now follows actual successful owned down;
  rejected down records a failed campaign and no successful removal receipt. Added focused lifecycle
  regression tests, preserving independent foreign inventory checks and all primary/cleanup errors.
  This changes only the integration harness and these notes, not the immutable intent or product.
- D-067 factual correction before geography presentation: unchanged
  `packages/infrastructure/src/ask/synthetic-ask.adapter.ts:39` returns placeId
  `sao-paulo-pinheiros`, not null as the initial exploration reported. Preserve the actual received
  binding as synthetic example metadata, independently of navigation geography and the unsent draft;
  a genuinely null value remains unbound. API-oracle tests prove actual binding and a null-input
  test proves absence handling. This supersedes only the mistaken null-fixture premise in the
  read-only intent block, Code Map and Design Notes. It does not alter scope, backend, contracts,
  data or any other D-066 boundary. English epic mirror and append-only Portuguese D-067 were
  recorded before implementing geography presentation.

## Review Triage Log

### 2026-10-22 — Review pass 1

- verdicts: 4 findings — high 0, medium 4, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` R1, ask-stream.ts: whole-chunk fatal decode discards a complete valid
    prefix before admission. Parent read decoder and its callback path through events/followAsk, and
    independently reproduced native fatal decoding throwing before exposing the valid prefix.
    Existing malformed-JSON coverage does not exercise malformed UTF-8 after complete frames.
    Amended decoding/partition regressions above; preserved attempted change at
    `.ignore/ask-positive-preservation-2026-10-22.patch` before re-derivation.
  - `[medium]` `[bad_plan]` R2, ask-session.ts and AskScreen.tsx: raw nested/full-object JSON
    serialization rejects equal independently serialized valid records. Parent checked all compared
    fields, public wire validation and parseWire returning the original object without key-order
    normalization. No upstream normalization disproves the claim. Amended typed semantic comparison
    requirements while retaining exact duplicate-byte rejection; same preservation patch applies.
  - `[medium]` `[bad_plan]` R3, AskRunRecord.tsx: formatQuantity caps area to two fraction digits,
    while askInputsWire accepts positive areas from Number.MIN_VALUE through 1000000. Parent checked
    the presenter, formatter and contract and reproduced 80.125 becoming 80.13 and 0.0001
    becoming 0. This directly violates exact operand presentation; amended Ask-local exact
    formatting and accepted-run PT/EN regressions. Same preservation patch applies.
  - `[medium]` `[bad_plan]` R4, web-ask.integration.test.ts: after catching the action error,
    screenshot/DOM/write failures exit before the original throw and ledger append. Parent traced
    attempt through runAskCampaign/preserveCleanup: the outer layer only receives the later error
    and cannot recover the swallowed primary. Amended independent capture/reporting aggregation and
    failure-path tests, preserving draft redaction; same preservation patch applies.

### 2026-10-22 — Review pass 2

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The fresh context-free Quick reviewer returned `[]` after reading the final
  unified diff, plan/context, repository instructions and surrounding source/contracts. No
  finding was omitted, patched, deferred or rejected in this pass. The four pass-1 findings
  remain recorded above; their re-derived fixes passed the independent verification checkpoint.

## Design Notes

This is a precisely specified code-led Operate extension, not a new visual world. The context tool
already ran this session; do not rerun it. Main read new-work.md/mode-operate.md/operate.md and the
existing system/shell brief. Implementer reads installed impeccable-v2 craft-floor immediately
before UI edits, preserves the brief's six blocks/inherited seed and incumbent DESIGN.md/sidecar. No
raster generation is needed. The owner is absent; D-066 resolves interactive confirmation.

The prepared contract cannot demonstrate model generation/citations: preserve the result/explanation
juxtaposition with explicit absence, not a fabricated model-written note. Original question remains
the fixture's question, distinct from unsent draft. Current place never launders a null fixture
place. No time-based fake animation or illustrated step/metric may replace actual evidence.

Parent owns bounded visual inspection: one batched matrix, fix all material gaps together, at most
one confirmation round. Open every capture sent onward. Then one detector on changed targets, fresh
context-free finish reviewer with request/decisions/brief/floor/all required captures/artboards;
check its five sections and act on disposition. No second detector or reopened parent polishing.
Fresh documenter after last correction preserves incumbent system files and records evidence/limits;
recheck documentation after later edits. These mandatory handoffs and BMAD Quick review are parent
work, not nested implementer agents. No final acceptance until both handoffs and gates complete.

## Verification

### Parent re-derivation verification checkpoint — 2026-10-22

Parent independently read the actual repaired product/test/helper/campaign sources and executed the
exact root chain successfully (2,608 tests; web 474), unchanged coverage floors, verbose focused Ask
(eight files/87 tests), verbose lifecycle helpers (three files/18 tests), integration discovery,
prepared-contract integration (two tests, 44.81s) and the owned browser integration (seven approved
scenarios, 148.76s total). The immutable primary parent campaign is
`apps/web/.impeccable/review/campaigns/ask-2026-10-22T10-57-38-613Z-bc1dc6e3/` and the repaired
thirteen-file source hash is `c1555e9c69ec1fee8096f34278537817ff92c224e2a5746aa087d96b81fa4182`. The
current parent verification record independently audits all 54 manifest hashes, 47 SQL before/after
tables, seven attempt references, served runtime identities, eighteen accessibility/ interaction
reports and exact-project Docker teardown. Every original matrix row and all four review-amendment
regression groups have actual passing coverage in these executions.

The bounded design review is not reopened: 29 of 36 new PNGs match the already inspected round-2
files exactly, and parent directly opened the seven changed files solely to confirm evidence
identity and unchanged state/product presentation. The single detector result remains `[]`. Parent
read both complete updated scoped confirmation records: finish returned `ship` with all five
contract sections and no material correction or recapture; the documenter reconciled the final
campaign and R1–R4 repairs, preserving historical attribution and global design documents. Renewed
BMAD Quick review remains a separate gate before acceptance or commits; these verification results
do not themselves claim acceptance.

**Implementer and parent both run after final source changes:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all succeed, no
  weakened thresholds/hooks/assertions or new exclusions.
- `pnpm run test:coverage` — all eight workspaces retain80/80/80/75 floors.
- `pnpm --filter @rei/web exec vitest run --dir src src/ask` — every matrix test runs and passes;
  include each covering test name/result in implementation notes for parent matrix audit.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/web-ask.integration.test.ts`
  — actual owned Compose browser campaign passes, evidence readable, all owned resources gone.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/ask-contracts.integration.test.ts`
  — unchanged prepared contract/security/replay/no-write proofs pass.
- `pnpm run test:integration:list` — campaign discovered, no skips/empty success.

After parent independent diff/verification/matrix audit and finish, run BMAD review. The goal's
orchestrator then uses auto-commit for implementation, tests and documentation separately, hooks
enabled, English Conventional Commits without scopes/trailers; no push. Ticket done is a separate
post-built parent action. Preserve full canonical baseline and source/artifact evidence identities.

## Auto Run Result

Built the prepared, read-only Ask completed-run screen: original question, exact backend result
and operands, recorded steps, provenance, thread, explicit availability boundaries, unsent draft
and bounded manual recovery. Capabilities remain memory/header-only. No backend, model execution,
source collection, dependency, migration or production change was made.

Files changed:

- `apps/web/src/ask/AskScreen.tsx`: screen orchestration, prepared follow action and recovery.
- `AskRunRecord.tsx`, `AskThread.tsx`, `ask-resources.ts`, `ask.css`: localized authored composition,
  exact received evidence, accessible thread and responsive presentation.
- `ask-client.ts`, `ask-stream.ts`, `ask-session.ts`, `ask-equality.ts`: bounded cancellable reads,
  incremental strict SSE, semantic snapshot continuity and byte-exact duplicate detection.
- Web routes, entry point, place resources and Vite coverage registration: screen integration.
- Eight Ask test files and two shell tests: component, transport, admission and routing coverage.
- `integration/web-ask.integration.test.ts` and five Ask support/test files: actual owned browser
  journeys, evidence, failure-preserving attempts and truthful campaign teardown.
- Epic Notes, surface brief, this plan and review records/campaigns: accepted decisions, design
  comparisons, source/artifact identity and immutable captured surface evidence.

Review: pass 1 confirmed four medium/bad_plan findings and required re-derivation. R1–R4 are now
fixed and covered. Pass 2 returned zero findings, zero patches (high 0, medium 0, low 0), zero
deferrals and zero rejections. Follow-up review recommendation: false; no unverified patched risk.

Verification: exact root lint/typecheck/test/build chain passed with 2,608 tests; unchanged
coverage floors passed; focused Ask 87 and lifecycle helpers 18 passed; integration discovery,
two prepared-contract tests and all seven browser scenarios passed. Parent independently audited
the current thirteen-file source identity, 54 surface hashes, 47 unchanged SQL tables, runtime
assets, all 18 accessibility/interaction reports and owned teardown. Finish returned `ship` and
the final documenter confirmation was read in full. No further visual round or detector ran.

Commit preparation only normalized JSON/Markdown whitespace without altering product code or
captured surface bytes. All 218 reformatted JSON reports were compared semantically with their
pre-format index contents: no data changes. All five completed historical/current campaigns
retain 54/54 valid surface hashes each, and the current thirteen-file source hash is unchanged.
Historical timestamps, baselines and pre-format boundaries remain historical, not new executions.

Residual limits: prepared examples do not execute the draft, generate model text/citations or
provide durable browser recovery. Human screen-reader, physical-device zoom/daylight focus and
live/deployed behavior are not proven by local geometry/axe checks. The existing build-size
advisory and reported pre-existing global documentation drift remain disclosed. No VPS action
or deployment acceptance is implied. Ticket completion is the parent goal's next acceptance step.

## Parent acceptance — 2026-10-22

Accepted after the full BMAD run reached `built`, final Quick review returned no findings and
the reviewed working tree was clean. Implementation, tests and documentation were committed
separately with every hook enabled:

- `a8c3d1dd489176874bc5e8b60f4c148af09c541b`: prepared Ask screen and transport.
- `6dfa7225dea2edcf0cd692166c2e5aeb4b4b55fc`: behavioral, lifecycle and owned browser tests.
- `d0ac97e6ad5ad20fe9d70d1de830da18a0a656b4`: reviewed surface and verification evidence.

The post-hook audit confirms all 783 reviewed paths are committed, the current thirteen-file
source identity is unchanged, and all 270 surface hashes across the five completed campaigns
still match their bytes. The seven current scenarios remain approved and all owned resources
were removed. No push, deployment, VPS access, live model execution or source collection occurred.
The goal orchestrator marked ticket 6.9 `done`; remaining stories and final cross-epic campaign
are not claimed complete by this acceptance.
