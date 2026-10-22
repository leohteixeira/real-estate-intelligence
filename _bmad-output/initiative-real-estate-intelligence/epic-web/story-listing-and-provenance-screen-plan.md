---
title: 'Listing and provenance screen'
type: 'feature'
ticket: '8'
created: '2026-10-22'
status: done
baseline_revision: 'be21042c84fab22bae0f120ec241e243e6aa37ea'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/docs/design/screens.md'
  - '/workspace/repos/real-estate-intelligence/docs/design/content-and-locale.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Property exposes source evidence but no complete Listing screen. Users cannot inspect
one publication's dated values, events, description rights and snapshot provenance as a coherent
public journey.

**Approach:** Implement story 6.8/CAP-19 using the existing validated Listing endpoint and authored
Placa Listing composition. Add a real Property drilldown and independent contextual Property read,
preserving exact validated Search return and explicit unavailable evidence.

## Boundaries & Constraints

**Always:** Follow epic-web Notes D-062, UX Listing section 168–185, existing shared system states
and current ADRs. Use PT/EN, 390/960/1440 layouts, local fonts, keyboard access, 44px targets and
real public typed reads. Preserve all existing behavior/coverage and prepared-versus-persisted
labels. Use strict TypeScript/Vitest integration, Supertest, owned real Compose
services/Testcontainers, Nock only for synthetic external boundaries. Keep source facts distinct
from Property conclusions. Risk is raised from low to medium because incorrect rights handling can
expose prohibited description text. Estimated change exceeds 100 lines and five files, requiring the
full route.

**Never:** Change backend/domain contracts, infer amenities from prose, recompute price-per-area,
invent retained snapshot counts or source dates, equate removal with sale, reconstruct denied
descriptions, inject HTML, expose raw objects/secrets or fabricate Operations/download links. No VPS
unlock, live sources, external calls, push, new branch, gate reduction, Node test/assert/custom
assertion harness, interactive approval, generated replacement artboard or unbounded visual
polishing. No .env reads.

## I/O & Edge-Case Matrix

| Scenario              | Input / State                                            | Expected Output / Behavior                                                                                                                            | Error Handling                                                                                 |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Publication           | Valid Listing response                                   | Publication Asking, server metric/formula, status, structured values with effective dates, source/run/snapshot/hash and original chronological events | Missing values remain unknown; zero remains zero                                               |
| Context               | Matching associated Property containing this Listing     | Actual ancestry and verified position/total, Search current, return to Property retaining exact applied Search URL                                    | Context failure/mismatch stays neutral and independently recoverable; Listing remains readable |
| Description allowed   | Masked current text and dated versions                   | Escaped current/version text, accessible version comparison and dates/hashes                                                                          | Never assume corrected versions equal original event hashes                                    |
| Description denied    | Change dates and source URL only                         | Explicit description-changed disclosure, dates and usable source link; no text/version bodies                                                         | No fallback/reconstruction of prohibited text                                                  |
| Snapshot              | Available, expired, unavailable or null synthetic expiry | Safe status/dates/hash; collections labelled as collections, retained count unavailable, honest thirty-day policy                                     | No raw-download/run link or made-up expiry                                                     |
| Identity/read failure | Malformed/v4 ID, 404, transport failure, failed refetch  | Invalid ID makes no request; safe public message/request ID; manual retry, known detail retained                                                      | Never render server-private payloads or silently auto-retry                                    |
| Navigation            | Search → Property → Listing → Property → Search          | Exact safe applied filters/order remain; history back/forward works                                                                                   | Reject external, duplicate, editor or otherwise invalid return values                          |

</intent-contract>

## Code Map

- `packages/contracts/src/properties/properties.read.types.ts` and `.read.dto.ts` —
  `ListingResponse`, `ListingDetail`, `parseListingResponse` already export the complete public
  union. `ListingDescription` is allowed current/versions or denied changedAt/source; history has
  created, price-changed, description-changed, removed, reappeared. Created has no initial price.
  Monetary values are cents; display both server-supplied metric and asking correctly, never
  recalculate business results.
- `apps/api/src/properties/properties.controller.ts` — real `GET /api/v1/listings/:id`;
  persisted-first facade applies current per-source rights. No API changes.
  `integration/listing-provenance.integration.test.ts` already proves genuine
  persistence/correction/revocation/expiry; browser prepared fixtures must not claim to replace it.
- `apps/web/src/api/client.ts` — abortable unknown-JSON parsing and sanitized `ApiReadError`;
  `places/place-client.ts` / `place-queries.ts` — add identity-validated Listing method/query
  following Property, retry false, stale 30s, no focus/reconnect refetch. Use cache key
  `['listing', id]`.
- `apps/web/src/properties/property-navigation.ts` — UUIDv7 validation, `validSearchReturn`,
  `propertyHref`, `propertyNeighborhood`; preserve validation. `PropertyDetails.tsx` and tests
  provide shared-state/retained-read patterns. `PropertyProvenance.tsx` is the natural explicit
  Listing entry; preserve `PropertySourceLink.tsx` local anchors and all accepted evidence
  interactions.
- `apps/web/src/routes.tsx` — add `/listings/:listingId` under AppShell before generic destination
  routing. `shell/AppShell.tsx` — special-case Listing identity so it is never treated as a place;
  derive actual neighborhood from verified associated Property, hide place picker and mark Search
  current.
- `apps/web/src/places/locale.ts`, `resources.ts`, `properties/property-resources.ts`,
  `places/formatters.ts` — add Listing namespace/resources using established PT/EN and exact
  formatters. Existing `shared/SystemStates.tsx` handles safe pending/error/manual recovery.
- `apps/web/src/styles/{tokens,components,place,property,system-states}.css` and `main.tsx` — reuse
  Placa primitives, rail/mobile navigation and 960px panel transformation.
  `docs/design/canvas/project/Listing.dc.html` is the only Listing artboard (390×1782); no authored
  desktop exists. Its interpreted amenities are superseded by UX MVP structured-only scope. Example
  street/price/date/count must never become fixture facts.
- `integration/web-property.integration.test.ts`,
  `support/{fixture,http,property-reads,property-capture,search-campaign,accessibility}.ts` — reuse
  unique owned Compose campaigns, real API oracle through parsers, asserted scroll-zero screenshot
  starts, independent artifacts/hashes, accessibility/geometry and exact cleanup with
  foreign-resource preservation. `apps/web/vite.config.ts` artboard allowlist may add only
  `Listing.dc.html` with local-font rewriting.
- Prepared Listing suffixes under `0199a3e0-0000-7000-8000-`: `000000000104` rich three-listing
  property, `000000000109` removal/reappearance, `000000000991` denied, `000000000992` expired,
  `000000000993` removed/null bedrooms. Supplementary properties are not prepared search-count
  proof. Snapshot availability is metadata, not an instantaneous storage-health probe.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/places/{place-client,place-queries}.ts`, `properties/property-navigation.ts` —
      add validated abortable Listing read/query and safe Listing navigation helper without
      weakening existing boundaries.
- [x] `apps/web/src/listings/ListingDetails.tsx` and focused sibling components/resources — render
      the complete Listing plate, Asking/formula, provenance, dated structured values, original
      events and permitted/denied description/version comparison; keep context request independent
      and bounded.
- [x] `apps/web/src/{routes.tsx,shell/AppShell.tsx,places/locale.ts,places/resources.ts,main.tsx}`
      and `styles/listing.css` — register route/i18n/styles and correct responsive shell context
      without changing Property/Overview/Search semantics.
- [x] `apps/web/src/properties/PropertyProvenance.tsx` — add a distinct real Listing entry carrying
      safe Search return, preserving all local evidence anchors and disclosures.
- [x] `apps/web/src/listings/*.test.tsx`, `places/place-client.test.ts`, `shell/AppShell.test.tsx`,
      navigation/locale tests — prove every I/O matrix branch with parser-valid fixtures,
      malicious/private text absence, unknown/zero distinctions, all event variants, independent
      context failure, escaped versions, invalid identity suppression and recovery/history.
- [x] `apps/web/vite.config.ts`, `integration/web-listing.integration.test.ts`,
      `integration/support/listing-reads.ts` — add owned real API/browser campaign and independent
      expected API facts, separate supported history/rights/snapshot/error journeys, six localized
      responsive surfaces, keyboard/axe/44px checks, exact back/history and cleanup proof. Extend
      existing Property browser assertions only for the new explicit entry.
- [x] `docs/design` Listing brief/evidence and plan notes — persist the inherited code-led surface
      brief before UI work, record parent authored-artboard comparison and finite independent finish
      review/documentation, then publish immutable traceable evidence without presenting
      screenshots/gates alone as fidelity proof.

**Acceptance Criteria:**

- Given Search with applied filters/order, when a user opens Property then its explicit Listing
  entry and returns, then the browser restores the same Property and exact applied Search URL, with
  Search current and no invented neighborhood.
- Given a Listing whose response carries no description text, when opened in either locale, then its
  screen visibly states description changed with supplied dates and source link, and no
  current/historical description text appears in DOM or a comparison control.
- Given allowed versions and all supported event types, when reading the actual browser screen, then
  the user can inspect escaped version comparisons, original event provenance and previous/current
  prices, while creation and removal make no unsupported price/sale claims.
- Given actual API Listing facts and separately proven Property membership, when viewing phone and
  desktop, then source, publication price, server formula/result, structured dated values, true
  context and snapshot limitations agree with independent parsed API readback.
- Given invalid identity, 404, listing/context failures and failed refetch, when using browser
  recovery, then private details remain hidden, known Listing stays visible, context does not invent
  facts, and manual retry recovers.
- Given all six PT/EN viewport combinations, when comparing built UI with the unmodified local-font
  authored Listing reference, then Placa hierarchy, typography, responsive composition,
  keyboard/44px targets and accessibility are verified with recorded finite visual review.

## Implementation Notes

Implemented the public Listing route and validated, abortable Listing read/cache using the existing
contracts. Property context is independent and verified by identity, membership and position before
supplying ancestry or counts. The explicit Property entry preserves local evidence anchors and the
validated applied Search return. Source facts, dated fields, all five event types, snapshot
limitations and permitted/denied description branches are rendered in both locales without changing
backend contracts or inventing evidence.

The parent read the staged unified implementation/test diff against the preserved baseline. The
review scratch diff is local-only, excluded by its exact path in `.git/info/exclude`; the owner's
repository-only write boundary takes precedence over the workflow's system-temp destination. It is
not a product artifact or a commit candidate.

Verification before the executor-only font correction: the exact root gate chain exited zero
(session 6361), with 2,501 unit tests across all eight workspaces. The complete coverage command
also exited zero (session 41132), preserving every threshold. Web coverage was 98.29% statements,
92.42% branches, 98.85% functions and 98.92% lines. These are test/build results, not visual
fidelity certification. Browser regressions, independent finish review and documentation remain
pending until their actual results are reconciled below.

The post-D-063 browser run `listing-2026-10-22T08-07-51-482Z-59f5f0fc` passed scenarios 001–003 and
stopped during 004: its generic capture helper required Condensed 600 on a 404 screen with no
Listing plate or visible consumer of that font. Preserve that attempt as inconclusive, not a product
failure or pass. The executor now records plate presence, requires the condensed font when a plate
exists, explicitly requires a plate in all six populated responsive views and retains their
local-font network checks; Barlow remains mandatory in every capture. This changes no product code,
fixture, acceptance outcome, accessibility check or coverage threshold.

## Plan Change Log

### 2026-10-22 — Bounded context and received evidence label

The quick review verified a context request that never settles has no deadline; the plan's
bounded-read instruction lacked an executable policy shared by shell and screen. D-065 selects a
ten-second total context deadline covering headers and body, cancellation propagation, no auto retry
and independent manual recovery. Re-derive the existing implementation from the preserved local
snapshot `.ignore/listing-positive-preservation-2026-10-22.patch`, then repair this gap. Do not add
a timeout to every public read. A Listing-specific contextual query must be used by both observers
with the same key/function/policy so deduplication cannot select an unbounded observer. Do not
convert navigation cancellation into a user-visible failure or leave deadline timers/listeners
running after settlement.

Also preserve `listing.fixtureLabel` in the existing native metadata disclosure, with localized
labelling/caveat explaining prepared versus persisted synthetic evidence without deriving storage
semantics from snapshot status. The raw label must remain verbatim, including supplementary branch
labels. Unit cases cover both locales and prepared/persisted labels. Browser cases inspect the
received label against independently parsed API evidence.

KEEP: all D-062–D-064 source/data/rights boundaries, exact navigation, source membership checks,
original event/hash distinctions, accessible eight full UTC times, concise table, local fonts and
finite Placa composition. Preserve all positive source and tests in the snapshot, all immutable
historical evidence, original finish review/bounded verdict/documentation and baseline revision. No
new artboard, detector, parent polish, backend changes or weakened assertions. Add deterministic
stalled-response and stalled-body tests, independent recovery and cancellation/cleanup tests; add
bounded browser fault proof that does not weaken existing checks. Run the root gates, coverage and
final Listing campaign; old artifacts remain scoped historical evidence. Recheck
finish/documentation only for this technical correction's affected UI and final artifact.

## Review Triage Log

### 2026-10-22 — Final review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none; the fresh Quick reviewer returned no findings against the final diff.

### 2026-10-22 — Review pass

- verdicts: 2 findings — high 0, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[bad_plan]` Listing's contextual Property read can hang indefinitely without a
    recovery action — verified `createApiClient.read` passes only the React Query cancellation
    signal and `propertyQuery` has no deadline. The plan required bounded context but did not
    provide a shared executable deadline; D-065 and Plan Change Log add ten-second total context
    policy and deterministic stalled-header/body/recovery tests. Positive implementation is
    preserved in the local snapshot before re-derivation.
  - `[medium]` `[patch]` The received `listing.fixtureLabel` is absent from Listing metadata —
    verified no Listing component renders it, while projection labels distinguish supplementary
    prepared branches and persisted synthetic evidence. Keep the patch requirement in the re-derived
    change: expose the verbatim received label in existing accessible metadata with localized
    wording and both-locale tests; no backend origin inference.

The independent Impeccable finish reviewer inspected all 19 required valid images and returned `fix`
for one P2 evidence-access issue: complete field-effective UTC times were available only as title
attributes on nonfocusable table dates. D-064 records the bounded correction before acting. Add one
localized native disclosure with eight labelled complete times below the concise table, preserving
Placa and 44px controls; unit tests use an attributes instant distinct from collection and history,
and browser checks must prove keyboard opening, visible exact values and click closing in all six
localized viewports. Rebuild/recapture the same 19 views plus six open-disclosure crops and return
only this material fix to the same reviewer. No second detector or renewed parent defect hunt.

The initial new unit check attempted Enter activation of native summary under jsdom and failed in
both locales: jsdom/user-event does not implement that browser default action. Keep native semantics
rather than adding a redundant application keyboard handler. Unit coverage checks focusability, real
click disclosure and all eight visible distinct timestamps; actual Enter activation is mandatory in
the real Chromium campaign for all six viewport/locale combinations. The failed unit attempt is not
a product failure or a keyboard pass.

Root gate session 26103 exited zero after the executor readiness corrections and before D-064 source
edits, with all 2,501 unit tests passing. It is historical pre-D-064 verification, not acceptance of
the new disclosure. The earlier complete Listing run, Property and Search regressions are likewise
explicitly scoped to their pre-D-064 source/artifact identities.

After the D-064 implementation and its unit/browser assertions were frozen, the exact root chain
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` exited zero (session
40555). All 2,503 unit tests passed, including 369 web tests and both localized distinct-attributes
disclosure cases; strict integration TypeScript and all eight workspace builds passed. The
production chunk-size warning remains a warning, not a disabled gate. The full
`pnpm run test:coverage` also exited zero (session 93567), retaining every workspace threshold. Web
coverage remained 98.29% statements, 92.42% branches, 98.85% functions and 98.92% lines; Listing
components have 100% statements, functions and lines. Real native Enter activation and the six
open-disclosure captures still require the final browser campaign; these unit/build results do not
substitute for it or certify fidelity.

## Design Notes

### Final BMad Quick acceptance pass

The fresh context-free Quick reviewer read the final baseline diff, plan and repository rules and
returned no findings. No code changed in response. The earlier two verified medium findings remain
recorded above and were repaired through D-065 re-derivation; they are not counted as new findings
in this pass.

### D-065 affected-UI finish finding

The independent late-change finish review opened all 33 required valid captures and returned `fix`
for one P2: at 960px in Portuguese, the new long metadata term starves the first definition list's
value column, splitting the Listing identifier into five lines with an orphan final digit. The same
implementation agent is applying one bounded Listing-scoped column correction and a real-browser
measure assertion. Preserve the verbatim values, caveat, native disclosure and all earlier
timestamp/context behavior. Recapture the same 33 paths and return only this listed material fix to
the same reviewer for a scoped verdict. No second detector, new world, copy rewrite or parent
aesthetic hunt is authorized by this finding.

### Final D-064 verification and matrix audit

After the executor's stale-cache precondition was corrected, the exact root chain ran again and
exited zero (session 58420): lint, strict application/integration typecheck, all 2,503 tests and all
eight workspace builds. No product source changed after the successful coverage session 93567. The
final Listing browser command exited zero (session 72307, 122.15s), immutable run
`listing-2026-10-22T08-31-04-848Z-ae910bf5`. Its seven semantic scenarios are approved; the parent's
independent structural audit reports 7/7, zero executor errors and no audit errors. All 141
surface-file hashes match, and all three served assets match their built hashes. This is
traceability, not a fidelity certificate. Source identity is
`1fae37a273fabe7a6c2d6c7ab628cb55d1b0d499404d3cae6c268a61e42fe4ae`; runtime web identity is
`339decf909fa03b9d18713294991163fcefc458127dd5766e1dd3d2c9334c033`, distinct from the recorded host
artifact. The owned project `rei-web-listing-eba77bc5-64cf-460a-96fd-79e28d599ed6` has no
containers, volumes or networks after teardown at 08:33:06.002Z; foreign resources remain.

The parent opened and validated all 25 final required images: the same six full, six top, two facts,
two events, two description and one reference captures, plus six complete-time crops. This validity
pass does not reopen parent polishing. All six browser receipts prove native Enter activation, eight
exact visible labelled UTC times and click closing, with open-state accessibility checks. The
canonical browser attributes date coincides with collection/creation; the two localized unit cases
separately prove an attributes instant distinct from collection and all history dates. Do not claim
that distinctness from the browser fixture. The final stale-refetch receipt proves browser-clock
advance of exactly 31,000ms and one injected refetch, followed by retained detail and real recovery.
The preceding 08:28 run remains inconclusive and is not promoted to a pass.

Every intent matrix row has covering tests that actually ran and passed, not merely registered or
planned tests:

| Matrix row            | Executed unit evidence in root 58420 / coverage 93567                                                                                                                                                                      | Executed browser evidence in final 72307                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Publication           | `ListingDetails.test.tsx`: bilingual source facts, all dated fields, all five event variants, immutable newest-first order, original provenance, no initial-price/sale invention; snapshot cases preserve null versus zero | LISTING-002 original events and LISTING-006 independently parsed publication facts                                               |
| Context               | `keeps Listing readable with neutral independently recoverable context` (failure/mismatch); `verifies associated Property identity, membership and position`                                                               | LISTING-005 failure, wrong membership and independent context recovery; LISTING-001 correct membership/count/navigation          |
| Description allowed   | `escapes allowed text, compares permitted dated versions and keeps original hashes distinct`                                                                                                                               | LISTING-002 permitted comparison, dates and original event hashes                                                                |
| Description denied    | `shows denied change dates and source with no text/version control` in both locales                                                                                                                                        | LISTING-003 both locales, no current/version body or comparison                                                                  |
| Snapshot              | available/expired/unavailable metadata, unknown retention/expiry, null bedrooms and zero parking                                                                                                                           | LISTING-003 denied/expired/removed/null evidence, source-only access and honest retention                                        |
| Identity/read failure | invalid/v4 request suppression; 404/503 sanitized manual recovery without automatic retry; retained failed refetch; validated Listing client identity/JSON/abort                                                           | LISTING-004 invalid identity, absent identity, private read fault, clock-proven stale refetch, retained data and manual recovery |
| Navigation            | exact safe Search return and back/forward; rejection of external/editor/duplicate return parameters; navigation helper tests                                                                                               | LISTING-001 Search → Property → Listing → Property → exact Search and browser history                                            |

The two localized `exposes all complete field-effective UTC times` unit cases also ran and passed.
Native Enter is established by real Chromium LISTING-006, not by the jsdom click test. Independent
Impeccable verdict and documentation, then the BMad acceptance review, remain separate completion
requirements.

D-063 records the first parent inspection findings before the single correction batch: compact phone
return/languages and native ancestry, status before Asking, porcelain bands, readable concise dated
values with complete timestamps preserved, localized formula disclosure and stable newest-first
original events. The second parent inspection is confirmation, not another self-directed polish
cycle. The earlier successful campaign remains historical evidence of the pre-correction build, not
proof of these changes.

D-062 resolves contract/design gaps before implementation. Keep collection count and unavailable
retained count separate. Use verified Property membership for total and hierarchy, never Listing
position as total. The existing Impeccable context lookup has already run for
`apps/web/src/listings`; do not rerun it or roll a new seed. Read/write the new primary surface
brief through the tool, inherit the Placa code-led seed `3d3cd1ae`, and read craft-floor immediately
before UI edits. Use the finite parent two-round screenshot comparison, one manual detector run once
UI is complete, independent fresh finish reviewer and documenter; preserve DESIGN and its sidecar.
The pre-existing build-path configuration warning is not part of this story. Owner autonomy
overrides interviews; no material intent gap remains.

## Verification

### Pre-width-correction D-065 verification and matrix audit

The re-derived implementation preserves the positive D-062–D-064 changes and repairs both findings
from the first Quick pass. Shell and screen now use the same Listing-specific context key, function
and policy. Its ten-second total deadline covers response headers and body parsing, propagates
navigation cancellation, aborts timed-out transport, removes timers/listeners on settlement, and
leaves general Property reads unchanged. The existing metadata disclosure preserves the received
synthetic evidence label verbatim with localized caveats.

The exact root gate chain passed after the final browser instrumentation (parent session 7910, exit
zero): lint, strict workspace/integration TypeScript, all 2,521 unit tests including 387 web tests,
and all eight workspace builds. Parent session 54852 was interrupted with exit 143 before build and
is not a passing chain. Implementer chain 29860 also passed before the final metadata-crop
instrumentation; its narrower timing is retained rather than overstated. Coverage session 28855
passed unchanged thresholds: web 98.22% statements, 92.46% branches, 98.59% functions and 98.95%
lines, with Listing components at 100% statements/functions/lines. No product source changed
afterward. Final integration harness formatting/lint/strict typing passed in session 92306.

Final browser command exited zero in session 33384 (119.22s), run
`listing-2026-10-22T08-54-05-065Z-edd0cb18`, seven semantic scenarios approved. The parent
independently audited its ledger (7/7, zero errors), hashed all 161 surface files (all match),
checked three served-versus-built asset hashes (all match), opened all 33 required captures, and
verified exact owned Docker labels return no containers, volumes or networks. Teardown was recorded
at 2026-10-22T08:56:03.322Z. Foreign resources were preserved. Identity: source
`e87eb778365ce7567648586e8c2a0b9b5a0acb99a2676f8092fe838374deb83e`; runtime web
`2254e7f8f4798207f08092ad7a859ce13a558e685df80cb531d927a58f7a5977`; owned project
`rei-web-listing-e4c7d485-5b1c-4adf-9e4a-c91562191098`. The earlier 08:50 D-065 run passed seven
journeys but lacks the final metadata crops and remains historical, not the final evidence packet.

Every matrix row in the preceding D-064 audit still has its covering unit tests executed in root
session 7910 and its browser scenarios executed in final 33384. In addition, `place-queries.test.ts`
passed stalled-response and stalled-body deadlines, cancellation during either phase,
already-cancelled suppression, success/failure cleanup and shared key/function/policy tests.
`ListingDetails.test.tsx` passed shared-shell/screen bounded recovery without a Listing reread and
bilingual verbatim prepared/persisted-label cases. Browser LISTING-005 independently measured
10,102ms, one stalled request ending in `net::ERR_ABORTED`, then context-only recovery with Listing
reads unchanged at nine. LISTING-006 proved keyboard opening, exact API-derived label, localized
caveat and accessibility in six metadata-open crops; all preceding navigation, rights/history,
snapshot, stale-refetch and full-time assertions also passed. These are behavior/traceability
results, not blanket visual certification.

Property, Search, Places and genuine persisted Listing provenance regressions remain at their
explicitly recorded earlier source boundaries. D-065 changes no backend/persistence/rights contract;
final root Shell/navigation tests and the Listing campaign exercise the changed contextual read and
navigation. No extra claim of rerunning those historical suites is made. The existing chunk-size
warning, incomplete one-shot detector and unexecuted human reader/daylight/zoom checks remain
disclosed. Independent affected-UI finish/documentation rechecks and the next BMad Quick pass are
separate requirements before acceptance.

### D-065 metadata-width correction: final verification

The preceding D-065 packet is historical at its stated source boundary: the independent finish
review subsequently found the localized 960px metadata measure regression. The bounded correction
adds a class only to the publication identifier definition list, gives its value column three of
five available fractions and permits terms to wrap. It changes neither shared definition lists nor
received values, labels, caveats or native disclosure behavior.

After those three source/executor files were frozen, the exact root chain
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed (parent session
68723, exit zero), including all workspace unit tests, strict integration TypeScript and eight
builds. Full unchanged-threshold coverage also passed (34721, exit zero). The focused implementer
run passed all 33 Listing screen tests and formatting/lint checks. The production chunk-size warning
is unchanged and does not represent a disabled gate.

The final browser command passed (98736, exit zero, 161.73s), immutable campaign
`listing-2026-10-22T09-04-08-352Z-fdac6e6e`. All seven semantic scenarios passed; the parent's
independent structural audit reports 7/7, zero executor errors and no audit errors. All 161
surface-file SHA-256 values match and all three served assets match their corresponding built
hashes. The parent opened every one of the same 33 required captures and checked section, viewport,
locale and loading validity before the scoped verdict handoff. These checks do not constitute
blanket visual certification.

Identity: base `be21042c84fab22bae0f120ec241e243e6aa37ea`, dirty source
`f5d06b588919250fcc09faf2f138145a74e6a6c0b8a0877143009ab29cf07103`, served web artifact
`d33f5be918b36c6ec08cec0d4c9463dd2724b51a0bf4e2b8f469943921b910b3`, image
`sha256:54e37ca7281054d09770d87176793f633bd441651bd57d6a1860f88a85316060`. The separately recorded
host artifact is not claimed byte-identical. Owned project
`rei-web-listing-7ad231ba-90ca-4c7c-ba0a-09e828a11d71` has zero containers, volumes and networks in
independent label checks following its recorded teardown at 2026-10-22T09:06:48.628Z; foreign
resources were preserved.

Every matrix row's unit and browser checks ran again in these successful final commands. At 960px in
each locale, the 294px metadata list gives values 166.796875px; the identifier occupies two lines of
24/12 characters and the evidence label two lines of 24/14, with no orphan digit. At 390px both
values take two lines; at 1440px each fits on one. All six receipts preserve exact API-derived text,
native keyboard opening, localized caveat and accessible open-state checks. The final deadline
receipt measures 10,180ms, exactly one stalled request ending `net::ERR_ABORTED`, context recovery
and Listing reads unchanged at nine. All earlier exact return, rights, original-history, snapshot,
failed-refetch and eight full UTC timestamp checks also passed. The same reviewer's fix-list
verdict, last-edit documentation recheck and next BMad Quick pass remain distinct gates.

The same finish reviewer returned `ship` in `listing-d065-finish-verdict.md`, scoring only the one
listed P2 as resolved after opening all 33 final captures. Its five contract sections and explicit
scope were checked by the parent. The mandatory last-edit ordinary-extension documenter recheck is
complete in `listing-d065-final-documentation.md`; it opened seven named final images, read matching
receipts and preserved all four recorded incumbent hashes plus the prior D-065 report. No
design-system rewrite or broader aesthetic approval is inferred. Original reports remain historical.
Only the BMad Quick acceptance pass remains before finalization.

**Commands:**

- `pnpm --filter @rei/web run test` — focused and full web coverage, including new matrix tests,
  pass unchanged thresholds.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/web-listing.integration.test.ts`
  — actual Listing browser verify and owned-resource cleanup pass, with six localized responsive
  surfaces and all outer-surface acceptance journeys.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — exact complete root
  gate chain exits zero; no thresholds or hooks weakened.
- Rerun affected Property/Search/Places browser journeys and existing Listing provenance integration
  as necessary for touched boundaries; record exact commands/results, not planned claims. Use
  auto-commit only after review and verification, separate implementation/tests/docs commits,
  English imperative, no scopes/trailers/push/new branch. Mark 6.8 done only after actual verify and
  root gates; continue next available story with VPS blocks unchanged.

## Auto Run Result

Implemented the public Listing evidence screen and Property drilldown with exact validated Search
return. Publication facts, server Asking/formula, original events, structured dated values,
permitted comparisons and denied-description boundaries remain faithful to parsed public contracts.
Independent verified Property context is bounded to ten seconds and manually recoverable without a
Listing reread. Received synthetic labels and complete UTC field times remain accessible through
native disclosures in both locales.

Changed files and responsibilities:

- `apps/web/src/listings/ListingDetails.tsx` and `listing-context.ts`: route orchestration, retained
  reads, independent recovery and verified ancestry.
- `apps/web/src/listings/ListingPlate.tsx`, `ListingFacts.tsx`, `ListingHistory.tsx` and
  `ListingDescription.tsx`: source-owned presentation, provenance, dated values, exact times, events
  and rights-aware escaped versions.
- `apps/web/src/listings/listing-resources.ts`: PT/EN vocabulary and honest prepared/persisted,
  retained-count and expiry caveats.
- `apps/web/src/places/place-client.ts` and `place-queries.ts`: validated Listing transport/cache
  plus the shared Listing-only total context deadline.
- `apps/web/src/{routes.tsx,main.tsx,shell/AppShell.tsx,places/locale.ts, places/resources.ts}`:
  route, styles, translations and verified neutral shell.
- `apps/web/src/properties/{PropertyProvenance.tsx,property-navigation.ts}`: explicit public Listing
  entry and preserved safe applied Search return.
- `apps/web/src/styles/listing.css`: inherited Placa responsive composition and the narrowly scored
  metadata-width correction.
- Six unit test/fixture files: all matrix branches, malicious/private absence, exact dates/labels,
  cancellation, deadline cleanup and shared context recovery.
- `integration/web-listing.integration.test.ts` and
  `integration/support/{listing-reads.ts,property-reads.ts}`: strict TypeScript, native
  Vitest/Supertest and owned real stack/browser proof, independent API facts, seven semantic
  journeys and exact cleanup.
- `apps/web/vite.config.ts`: allowlisted authored Listing critique reference served with existing
  local-font rewriting.
- Listing briefs, parent comparison, epic Notes, this plan and immutable review campaigns:
  decisions, source-bound evidence and independent scoped verdicts.

Final review triage (2026-10-22): zero findings — high 0, medium 0, low 0, false 0, maybe-false 0.
Zero new patch entries, zero deferred entries, zero rejected findings. Earlier pass: two medium
findings; the bounded-context bad-plan entry caused documented re-derivation and the verbatim-label
patch was preserved and verified in that re-derivation. Both were covered by final tests. Follow-up
review recommendation: false (this final pass patched high 0, medium 0, low 0 and has no named
unverified patch risk).

Verification: exact root chain passed (68723), full unchanged-threshold coverage passed (34721),
final real Listing browser campaign passed (98736; seven of seven journeys). The matrix audit above
identifies executed covering tests. Independent ledger audit, 161 evidence hashes, three served
asset comparisons and owned teardown checks passed. All 33 required captures were opened by parent
and finish reviewer; the single scored P2 was resolved. Last-edit documenter recheck completed
without changing the incumbent system. These checks are not blanket fidelity or universal
accessibility claims.

Residual limits: the recorded one-shot detector is incomplete; human screen-reader/daylight/zoom
checks were not executed; prepared browser facts do not replace the separately recorded genuine
persisted-provenance integration. The existing chunk-size warning and unrelated product/design
documentation drift remain disclosed. Commit hooks may normalize report whitespace without changing
the captured product or the already formatted surface bytes covered by hashes; preservation hashes
in historical reports refer to their stated write boundaries. No backend, external source, VPS,
deployment, environment variable, branch or provider-key change was introduced. No push is
authorized. Ticket acceptance follows reviewed commits and the orchestrator continues the next ready
story.

### Ticket acceptance

Story 6.8 was marked done only after reviewed implementation, tests and evidence
were committed, with a clean worktree at the BMad built boundary:

- Implementation: `a91b4c36d056f8747275b92568b81f533df9dce3`.
- Tests: `3191a8b5c3362dace1da5db24f4584f83f56f491`.
- Documentation/evidence: `d4b9d11d8d6620e9537c5be403e2ae057cf3d380`.

All hooks remained enabled. The first documentation commit attempt failed
Markdown line-length checks; mechanical prose wrapping and fenced long commands
repaired it without changing intent words, assertions or product source. The new
commit passed every hook. After hook formatting, the final seven-journey ledger
audit still passed and all 161 final surface hashes matched. Six incidental Ask
JSON whitespace diffs returned to their baseline bytes rather than becoming
product changes. Historical report preservation hashes retain their stated
pre-format write boundaries. No deployment or VPS acceptance is implied.
