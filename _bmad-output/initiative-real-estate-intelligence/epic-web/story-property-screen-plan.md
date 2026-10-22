---
title: 'Property screen'
type: 'feature'
ticket: '7'
created: '2026-10-12'
status: 'built'
baseline_revision: '1d9080a42c82db5c0dcd4a791cf042379adc3ef6'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/workspace/repos/real-estate-intelligence/specs/adrs/0028-web-routing-data-and-component-tests.md'
  - '/workspace/repos/real-estate-intelligence/apps/web/DESIGN.md'
  - '/workspace/repos/real-estate-intelligence/docs/testing/integration.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Property has no public web route; Search cannot open a detail. Story 6.7 must show
every Property-section UX element for the three-listing fixture, except the comparables table and
compare/alert actions explicitly excluded by verify.

**Approach:** Build the complete Placa Property surface on parsed `/api/v1/properties/:id`, connect
Search, preserve place context/return navigation, and prove the journey through actual owned stack
HTTP and Chromium. D-060 resolves missing contract data explicitly instead of manufacturing values.

## Boundaries & Constraints

**Always:** PT/EN, 390px and >=960px authored composition; local fonts/tokens; every figure dated
and traceable; Asking distinct from Sale. Reuse parser, abortable transport, no automatic retries,
shared Query policy, sanitized UUID support references. Display backend facts unchanged.
Integrations are strict TypeScript/Vitest with Supertest and Testcontainers-owned real services.
Preserve all coverage, hooks, gates and known states. Follow D-060 and inherited Placa brief; root
owns finite visual comparison, independent finish review and documenter before acceptance.

**Never:** Business calculations in UI, fake neighborhood median/fingerprints/reason scores, exact
unit, invented block range or dated initial price, copying artboard figures, raw-snapshot download,
dead Listing/Operations routes, V2/protected controls, live models, sources, secrets, VPS, push, new
branch or automatic acceptance. Do not alter Overview's Search links (D-057) or incumbent design
system. Ask handoff stays draft-only until 6.9, text never in URL/log/local storage.

## I/O & Edge-Case Matrix

| Scenario                   | Input / State                             | Expected Output / Behavior                                                                                                                                                                                       | Error Handling                                  |
| -------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Three listings             | Property UUID ending 001, prepared detail | R$780,000 Asking; R$9,512.20/m²; Aurora/date; separate no Sale; both dated backend reductions; three lifelines; nine reasons, 0.95 illustrative; balcony/elevator 3 reporters; Cobalto neighborhood disagreement | No invented median or image evidence            |
| Return gap                 | Vila Mariana property ending 004          | Actual Brisa/Cobalto intervals share monthly axis; April–June Cobalto removal dashed; history readable                                                                                                           | Never removed=sold                              |
| Denied / expired           | Supplementary UUIDs 901/902               | Allowed public evidence only; denied text absent, changed dates safe; expired snapshot date/hash retained                                                                                                        | No object keys, photo or download               |
| No active / null           | Supplementary 903                         | Asking/per-m² unavailable, bedrooms unknown, active count zero; retained removed history and no Sale                                                                                                             | Null never rendered zero                        |
| Persisted unresolved       | Public persisted detail                   | Actual chronology/metadata; no calibrated match, no fake 95%; empty reasons explained                                                                                                                            | Probability zero not proof of mismatch          |
| Invalid / missing / failed | Bad UUID, real 404, bounded error         | No detail request for malformed ID; neutral context; safe error/manual retry; known detail retained on failed refetch                                                                                            | No raw error/body exposure                      |
| Search return / Ask        | Applied Search URL or direct detail link  | Search current, real neighborhood context; return retains validated filters/order; Ask gets escaped labelled draft via state                                                                                     | Reject external/unsafe return URL; no execution |

</intent-contract>

## Code Map

- `packages/contracts/src/properties/properties.read.types.ts`, `properties.read.dto.ts`: exact
  PropertyResponse parser/types. Summary has nullable neighborhoodComparison/belowMedianPercent;
  reasons only attribute/shared-feature/published-neighborhood-disagreement, no reason score/images.
  FeatureAgreement reports backend counts/percent and listing/source IDs. Listing history/lifelines
  and safe snapshot metadata are returned; descriptions are discriminated allowed/denied.
- `packages/infrastructure/src/properties/synthetic-properties.projection.ts`: authoritative UUIDs
  001 three listings 101/104/107, 004 genuine return gap, supplementary 901/902/903 branches.
  Prepared 001 has two reductions Jan/Jul2026, nine reasons, six source agreement rows, balcony and
  elevator 100%; Rua Cenário Um/Bela Vista, not artboard Pinheiros. Persisted facade is
  persisted-first.
- `apps/web/src/places/place-client.ts`: existing property(id,signal) validates UUID and parsed
  matching identity through canonical `api/client.ts`; reuse, no second transport. Query policy in
  `place-queries.ts`; unify Property key by actual property ID for shell/screen/reductions observers
  without duplicate requests, preserve callers. Cache never treats UUID as place ID.
- `apps/web/src/routes.tsx`, `shell/AppShell.tsx`, `shell/PublicNavigation.tsx`: only place-based
  routes today; add Property under shell and Search-current context based on returned breadcrumbs.
  Unknown context uses neutral index links. Existing shell's `/:destination/:placeId` alone is wrong
  for Property. Preserve landing, normal place titles/catalogue, three public destinations.
- `apps/web/src/search/SearchResults.tsx`, `shared/PropertyRow.tsx`: rows accept href but currently
  non-links; connect real route with encoded internal applied Search return path. Keep server
  filters, ordering, no eager detail reads and pagination. `places/PlaceReductions.tsx` stays
  unchanged.
- `apps/web/src/places/formatters.ts`, `PlacePlate.tsx`, `PlaceSeries.tsx`: reuse formatting/chart
  accessible narration, canonical proper names, not fake PlaceDetail/counts or market formulas.
  `styles/components.css` already supplies life/ev/bar/fig/tag/panel primitives.
- `apps/web/src/places/locale.ts`, `resources.ts`, `main.tsx`: register bundled Property namespace
  and scoped stylesheet. `shared/SystemStates.tsx` and API client preserve safe recovery.
- `apps/web/src/search/SearchResults.test.tsx`, `integration/support/search-reads.ts`: update the
  intentional no-link oracle to genuine Property links while retaining no-eager-detail guard.
- `integration/web-search.integration.test.ts`, `support/search-campaign.ts`, `support/fixture.ts`,
  `support/accessibility.ts`: established owned production stack, actual API oracle, bounded native
  Chromium, full-page axe, >=44px targets, font/overflow/keyboard checks, cleanup failure
  preservation, formatter-before-hash immutable evidence. Property campaign must allow its real
  detail endpoint, forbid writes/external requests; no hardcoded Search scenario IDs/attempt
  folders.
- `docs/design/canvas/project/Property.dc.html`, `DesktopProperty.dc.html`: exact authored layout;
  exclude unavailable protected/compare/alert/comparables controls; actual contract data owns copy.

## Tasks & Acceptance

**Execution:**

- [x] `apps/web/src/properties/property-navigation.ts`, `.test.ts`, `places/place-queries.ts`,
      `routes.tsx`, `shell/AppShell.tsx`, `PublicNavigation.tsx`, associated `.test.tsx`: fail-first
      tests for detail route/cache, valid internal Search return, direct links/other neighborhood,
      malformed ID, Search current and unchanged public shell. Implement canonical typed read
      query/navigation.
- [x] `apps/web/src/properties/PropertyDetails.tsx`, `PropertyPlate.tsx`, `PropertyPrices.tsx`,
      `PropertyHistory.tsx`, `PropertyLifelines.tsx`, `PropertyEvidence.tsx`,
      `PropertyFeatures.tsx`, `PropertyProvenance.tsx`, `property-presentation.ts`,
      `property-resources.ts`, `.test.ts(x)`: parser-validated complete fixtures and fail-first
      outer-component tests for matrix. Implement block summary, minimum Asking provenance, explicit
      Sale absence, unavailable neighborhood/images, actual dated changes and first-listing
      chronology, shared-axis intervals/ticks/dashed gaps, uncalibrated probability and membership
      bars per returned reason, source disagreements, feature reporters/non-reporters, safe
      first/last/snapshot metadata and local evidence anchors. Chart geometry is presentation only;
      complete readable event details remain accessible.
- [x] `apps/web/src/styles/property.css`, `main.tsx`, `places/locale.ts`,
      `search/SearchResults.tsx`, `SearchResults.test.tsx`, `integration/support/search-reads.ts`:
      inherit Placa artboards, stacked phone and desktop two-column rhythm with bounded compact
      disclosures, add PT/EN namespace, connect actual Search rows, preserve exact return URL and
      Ask draft privacy. Maintain all existing Search assertions except intentionally replaced
      non-link rule.
- [x] `integration/web-property.integration.test.ts`, `integration/support/property-reads.ts`: add
      owned read-only production PG/migrations/API/web campaign using Supertest oracle and Chromium.
      Verify all three-listing elements, actual removal branch, denied/expired/no-active,
      direct/filtered navigation/return, Ask draft, safe failure/manual recovery; actual persisted
      unresolved detail if provisioned safely through owned fixture, otherwise isolated labelled
      regression, never claim prepared API proves persisted branch. Capture PT/EN390/960/1440,
      authored reference dimensions, keyboard/focus/all44px controls/no overflow/local
      fonts/full-page axe; source-hashed artifacts and exact teardown retain failed attempts.
      Evidence manifests formatted before hashing.
- [ ] `_bmad-output/initiative-real-estate-intelligence/epic-web/story-property-screen-plan.md`,
      `apps/web/.impeccable/surfaces/src-properties-propertydetails-tsx.md`,
      `apps/web/.impeccable/review/property-*.md`, `docs/testing/integration.md`: append actual
      evidence, perform finite parent visual comparison with rendered artboards, once-only detector,
      fresh finish reviewer and documenter preserving incumbent system. BMAD review/gates and
      auto-commit precede accepted done; implementation agent does not commit or declare visual
      acceptance.

**Acceptance Criteria:**

- Given actual Bela Vista Search, when the visitor opens its three-listing row, then the browser
  displays every Property UX block with independently parsed response values, true dates/sources,
  Asking distinct from no Sale, actual nine reasons and features, and explicit contract gaps.
- Given actual Vila Mariana return history or no-active/denied/expired branch, when detail opens,
  then the browser shows truthful removed gaps and retained safe evidence without sold inference,
  forbidden descriptions, fabricated numbers, photos or downloads.
- Given applied filtered/ordered Search, when opening Property and using its return control, then
  the browser returns to exactly the applied internal URL. Given direct Property of another place,
  when navigating shell or Ask, then destinations use its actual neighborhood and Search is current;
  Ask retains a labelled unexecuted draft, never a question in URL/storage or a mutation.
- Given invalid identity or forced failure, when loading/refetching and manually retrying, then the
  browser suppresses invalid requests and raw errors, retains real known detail and recovers via
  actual API without fabricated identity or automatic retries.
- Given both locales at390/960/1440, when reading and keyboard-walking the complete screen, then
  authored Placa composition remains readable, no horizontal overflow occurs, local faces load,
  visible control bounds are >=44px and whole-page axe finds no violations without exclusions.
  Independent visual comparison/reviewer/documenter and root gates provide separate finish evidence.

## Implementation Notes

Historical pre-Round-1 implementation record follows; current D-061 shipping identity and evidence
are recorded in Verification and the terminal handover, not inferred from these earlier captures.

Implemented the public UUIDv7 detail route, shared ID-only Query key, native Search links with exact
validated applied return URLs, actual-neighborhood shell context and state-only draft Ask handoff.
The PT/EN Property surface contains the block plate, null-safe room/area summary, backend minimum
Asking provenance, separate no Sale, both dated price changes, shared continuous monthly lifelines,
removed gaps/ticks, uncalibrated reasons and local evidence links, source agreement/reporters,
permission-discriminated descriptions and safe retained snapshot metadata. No backend, protected
action, incumbent DESIGN/sidecar/PRODUCT, unit number, median, image evidence or raw download
changed.

Outer regressions cover non-v7 UUID-looking identities without detail requests, other-neighborhood
direct links, unknown structured feature strings and non-reporters, shared-axis labels/ticks/gaps,
loading/error/manual recovery and retained known data. Persisted unresolved membership is a labelled
parser-validated isolated regression; no persisted fixture or calibrated result is claimed.

The complete owned browser run is
`apps/web/.impeccable/review/campaigns/property-2026-10-12T15-33-28-443Z-080b9fe8/`: seven distinct
semantic scenarios approved, zero executor errors, structural audit trusted with no errors. Its
50-file manifest verifies all copied bytes, twelve whole-page axe reports have zero violations, and
every captured visible control is at least 44px in both dimensions with no overflow. The six
complete PT/EN 390/960/1440 surfaces and authored 390×1842/1440×1207 references are immutable
scenario evidence. Owned teardown was confirmed at `2026-10-12T15:34:20.820Z`.

Property source SHA-256: `4c3e440e2c82f8e0cec849209bada9e9163d868f03a52a40ad8be1b09d7ef0e2`. See
`apps/web/.impeccable/review/property-implementation.md` and the run's `surfaces.json` for named
captures, exact hashes, historical failures and limitations. Six earlier failed runs remain intact;
executor assumptions were corrected, and the real quiet-return contrast defect was fixed and
rechecked without excluding axe rules. The first four original teardown timestamps remain null; the
later exact-label absence audit is separately identified in `property-historical-teardown.json`.

Parent-owned visual inspection, once-only detector, independent finish reviewer/documenter, BMAD
review and acceptance remain pending. No implementation agent visual verdict or commit was made.

## Plan Change Log

## Review Triage Log

### 2026-10-22 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free Quick reviewer returned `[]` after reading the frozen
  baseline diff, plan/context and repository rules, checking surrounding route/cache/navigation,
  contract rendering, evidence disclosures and owned-campaign code. The later documentation-only
  commit inventory was also checked: its 1,295 diff paths and own additional path are complete
  and unique. Focused independent verification passed five files/80 Property and Search tests.
- No grouping, patch, defer or rejection is required. This first pass patched high 0, medium 0
  and low 0; follow-up review recommendation is `false`, with no named unverified patched risk.

D-061 authorizes one batched correction of parent Round 1: compact the Property-only shell and
reported street plate; put phone summary/Ask on porcelain; retain nine visible participation bars
and canonical attributes while grouping complete evidence/provenance in native expansions that local
source links open. Make real chart prices/dates legible and shared monthly labels responsive without
overlap. Localize prepared warnings while disclosing the received raw label. Preserve all unknowns,
disagreements, unavailable states and 44px controls. Full/top captures must start at asserted scroll
zero and report actual visible content fonts. Keep the original campaign historical; one fresh owned
campaign and the parent-owned second inspection follow this coherent fix batch.

## Design Notes

D-060 and the Property surface brief govern missing data, native local evidence links and Ask draft
semantics. Existing code-led Placa world/candidate4/seed3d3cd1ae is precisely specified, so no roll
or generated comp. Dynamic charts are permitted data graphics, not illustrations. Preserve DESIGN,
sidecar and PRODUCT bytes. The parent owns the two batched inspection rounds and scoped independent
finish verdict/documenter, not self-certified thumbnail fidelity.

Golden fixture checks: `expect(screen.getByText(/780/)).toBeVisible()` is only a smoke example;
author actual unambiguous labelled-region tests and compare all parsed values. Price percent
formatter accepts ratios: returned `changePercent / 100` is display conversion only. Nine reason
bars encode listing participation counts and explain that semantics, never new business strength.

## Verification

### Resumed verification — 2026-10-22

The owner explicitly resumed the goal from the October 22 handoff. Root completed the remaining
own-context reading through line 60,558 of the checkpoint diff, whose SHA-256 remained
`71ef58a90fc3c57d46a9b8d882e21429842956b90f691058f1332f9cd389d3e4`. The resumed capture helper now
accepts only `Pick<Page, 'evaluate'>`; its typed Vitest mocks no longer cast a partial object to the
full Playwright runtime client. Runtime behavior is unchanged. Both pause handoffs are deliberately
included as historical documentation, not current status. Root reread their complete additions and
both complete helper diffs; the other 944 file diffs were checked byte-for-byte against the
already-read checkpoint diff. The intermediate review diff has SHA-256
`7065d2397cd3d16475d8228c9faec542f9e3c41cfb0703d7169bf1af4b9fecce`.

The earlier live gate handle 64793 was no longer available after continuation; process inspection
confirmed no remaining gate process. Its final result is not inferred. Fresh session 63660 ran the
exact root lint/typecheck/test/build chain to exit zero: all eight workspaces and 2,466 tests
passed, including strict integration type checking. Session 46256 independently passed all 26 web
files/332 tests. Session 28635 passed strict integration type checking, scoped capture-helper ESLint
and all six support files/32 tests, including the three typed capture regressions. The preceding
coverage session 92475 had completed with exit zero under unchanged thresholds; no runtime source
changed after that run. Fresh coverage session 32337 also completed with exit zero across all eight
workspaces: web statements 98.13%, branches 92.37%, functions 98.74%, lines 98.82%; Property
statements/functions/lines 100% and branches 86.66%. No coverage floor or exclusion changed. Scoped
Markdownlint retained all existing rules and passed both handoffs and this plan; Prettier passed
both handoffs and helpers. Staged whitespace checking passed.

Root independently rechecked the final October 12 Property manifest: all 60 hashes match, the twelve
accessibility receipts have zero violations and incomplete items, and current Property source hash
still matches the finite visual review. This is artifact verification, not a new visual round. A
fresh combined Property/Search/Places browser regression is tracked separately; formal BMAD review,
acceptance and commits remain pending.

A wider recheck also verified all 586 entries in eleven staged surface manifests. The first
diagnostic again resolved a nested Property manifest against its own folder instead of the campaign
root and returned ENOENT; the corrected resolver used `evidencePath` from the campaign root, with
filename-only Search entries relative to their manifest. It found no hash mismatch. The in-flight
Places campaign rewrites loose accessibility JSON; a concurrent formatting check reported eighteen
such files. Final formatting is deferred until the campaign is terminal and does not authorize
rewriting any immutable evidence bytes.

Fresh combined browser session 4458 terminated with exit one: Property and Places passed, while
Search failed at SEARCH-007. Its retained campaign `search-2026-10-22T06-53-50-834Z-fe96a363`
records six approvals followed by an executor failure. Root inspected the failed screenshot and
request readback: both independent reads failed, but retrying the total removed one button and
invalidated the positional `nth(1)` locator for results. The executor now waits for both semantic
failure blocks, scopes each manual retry by its distinct message and requires each block to
disappear before checking the actual recovered API values. No product behavior, assertion floor,
automatic retry or timeout changed. Strict integration type checking and scoped ESLint passed in
session 25763. The failed run remains unchanged; `search-resumed-teardown.json` separately records
the later exact-label absence audit. The passing Property run
`property-2026-10-22T06-55-26-598Z-5b5ac9f8` records owned teardown at `2026-10-22T06:57:22.965Z`
with all fourteen foreign containers and thirteen volumes preserved. Post-fix combined browser
session 99173 completed with exit zero: all three selected files/tests passed in 519.77 seconds.
Search run `search-2026-10-22T06-57-48-519Z-57af1123` approved all eight scenarios and confirmed
owned teardown at `2026-10-22T06:59:31.670Z`; its 96 immutable hashes and 24 whole-page
accessibility receipts were independently checked without violations or incomplete items. Property
run `property-2026-10-22T07-04-31-658Z-d2331c83` completed its seven scenarios and confirmed owned
teardown at `2026-10-22T07:06:27.116Z`. Property source identity still matches the finite visual
review. Places also passed in this same terminal command. The failed Search attempt remains
preserved; no retry policy or historical verdict was rewritten.

After the browser process terminated, formatting session 92040 checked all 786 recognized changed
text files and mechanically formatted only nonprotected text. All 1,402 hash entries across the
21 available surface manifests matched before and after formatting; immutable evidence was not
rewritten. The final Property ledger independently contains seven approvals and no executor errors;
its 60-file manifest and twelve accessibility receipts remain valid, with zero violations or
incomplete items. Its teardown receipt confirms exact owned-resource absence and unchanged foreign
container/volume baselines. All seven matrix rows have executed passing coverage, including the
explicitly isolated persisted-unresolved regression; no broader persisted/browser claim is made.

### Parent terminal verification — 2026-10-12

Root session 97728 completed the exact lint/typecheck/test/build chain with exit zero. All eight
workspaces passed: contracts 183, domain 649, AI 212, web 332, application 222, infrastructure 444,
API 197 and worker 227 tests (2,466 total). The strict integration TypeScript gate ran as part of
root typecheck. Coverage session 19035 completed with exit zero under the unchanged existing
statement/line/function/branch floors; no new percentage is inferred from the truncated text output.
A later unfiltered web run (16125) again passed all 26 files/332 tests.

The final selected browser command ran all three files together serially in session 73253: three
files/three tests passed, 290.53s. Property's seven semantic scenarios were approved in
`apps/web/.impeccable/review/campaigns/property-2026-10-12T16-08-46-994Z-0de21a39/`; Search's eight
were approved in `search-2026-10-12T16-07-38-255Z-def21f3d/`. Both structural audits returned
trusted counts and no errors. The new Property manifest's 60 hashes independently matched; twelve
axe reports have zero violations and incomplete items. Property teardown confirms exact
owned-resource absence at `2026-10-12T16:09:43.290Z` and unchanged foreign resources. Search records
completed teardown at `2026-10-12T16:08:46.032Z`; it does not produce a separate root
`teardown.json`, unlike Property. The passing Places test remains the third real-stack navigation
regression in the same command.

The new Property source/web/backend hashes equal the already visually reviewed immutable run:
`3bd5945e4eae4e7c7407bc5722ef9c2bb90b92ed90981ec9f4bbfb32e41144ba`,
`9b23eceda4b0554e3e0f00364ebed1298f5c276aba45f7f506fc13c8c6807b13`,
`57642c89461a138a2d51a2cc83876f1a271a524ac41b9fff9c0616b6476d1e37`. The parent's two visual rounds
are complete, the once-only detector returned `[]`, and the fresh independent finish reviewer
returned all five contract sections with disposition `ship` and no material fixes. Its scope and
unavailable standalone QUALITY BAR limitation are preserved in
`apps/web/.impeccable/review/property-finish-review.md`.

Support session 61499 passed six files/32 tests, including conventions, HTTP, fixture lifecycle,
cleanup, Search evidence and the three Property capture-framing regressions. Sessions 73261 and
88340 independently passed strict integration typecheck and scoped integration/config ESLint.
Discovery session 84498 passed, but discovery is not treated as test execution. Earlier selected
support session 9700 passed only three files/11 tests because some supplied filters did not exist;
the six-file run is the complete support evidence, not the earlier command.

### Matrix test audit

Every row below has covering tests registered in the unfiltered passing web suite. Browser scenario
coverage is separate and comes from the passing combined real-stack command.

| Matrix row                 | Executed component/policy tests                                                                                                           | Executed browser evidence                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Three listings             | `shows parsed values and all complete blocks in %s without invented evidence`; nine-visible-bars/native-detail regression                 | Parsed real three-listing oracle and six normal PT/EN viewport surfaces                                                    |
| Return gap                 | `uses actual other-neighborhood context and one date scale for visible labels, bars, ticks and gaps`; both common-axis presentation tests | Actual 004 detail and visible removal interval                                                                             |
| Denied / expired           | `renders the parsed %s branch truthfully`, denied and expired instances                                                                   | Actual 901/902 details with absence of forbidden descriptions and retained safe metadata                                   |
| No active / null           | Same parameterized outer test, removed instance                                                                                           | Actual 903 with unavailable Asking, unknown bedrooms, zero active and retained removed history                             |
| Persisted unresolved       | Same parameterized outer test, unresolved instance                                                                                        | Explicitly unavailable prepared-API branch; isolated parser-validated regression only, as authorized by the execution task |
| Invalid / missing / failed | All three malformed-identity instances; `retains known detail on failed refetch and safely recovers manually`                             | Invalid UUID no request, real 404, bounded initial error and retained-data recovery                                        |
| Search return / Ask        | Exact-return/draft outer test; internal-return validation and actual-neighborhood/cache-key policy tests                                  | Applied Search return, other-place direct detail, state-only masked Ask draft and no writes                                |

### Documentation and evidence formatting

The fresh documenter returned an actual terminal handover and produced
`apps/web/.impeccable/review/property-documentation.md`. It records the preserved incumbent system,
the actual scoped five-section ship verdict, pre-existing documentation drift and fidelity limits.
Root read the final record and independently rechecked the unchanged PRODUCT, DESIGN and sidecar
SHA-256 values. No design-system refresh, new visual round or detector invocation occurred.

Formatting session 1938 failed on generated evidence metadata and loose capture JSON. A subsequent
Prettier API audit identified 271 noncanonical text files and zero protected evidence files among
them. Session 38970 mechanically formatted only those 271 files. Before and after formatting, root
independently verified all 586 entries across 11 staged surface manifests: zero missing files or
hash mismatches. Property paths resolve from the campaign root through `evidencePath`; Search's
filename-only entries resolve beside their manifest. Initial diagnostic resolvers used the wrong
base for nested manifests; their ENOENT output was not evidence loss and no receipt was fabricated.
No hashed evidence bytes or historical outcomes were rewritten. Session 33621 passed Prettier on all
595 staged text files, then reported MD013 in twelve campaign reports. Session 9795 wrapped only
those reports' prose without changing their results, passed Markdownlint on all twenty changed
Markdown documents with existing rules, passed their Prettier check and passed staged whitespace
checking. The formatted text files and reports were explicitly restaged.

The full staged-diff reading, BMAD code review and auto-commit remain explicit acceptance work. No
accepted `done` is inferred from these gates.

### Earlier D-061 implementer verification

Current D-061 verification supersedes the shipping identities below: 26 web files/332 tests,
production build, strict integration TypeScript and three capture-start helper tests passed
in 64769. Owned Property campaign 26207 passed all seven semantic cases at
`apps/web/.impeccable/review/campaigns/property-2026-10-12T15-56-41-639Z-ef818a91/`. Its structural
audit is trusted, all 60 immutable hashes match, twelve full-page axe reports have zero
violations/incomplete items, and all full/top captures start at asserted document zero. Actual
content Barlow/local font checks and visible 44px targets pass. Owned teardown completed at
`2026-10-12T15:57:38.332Z`; no implementation session remains active. Current Property SHA-256 is
`3bd5945e4eae4e7c7407bc5722ef9c2bb90b92ed90981ec9f4bbfb32e41144ba`. The failed D-061 focus campaign
23583 and both earlier unit failures (65309 and 42959) remain honestly recorded in
`property-implementation.md`; 23583 is a genuine product focus failure, not executor-only. Its
original campaign and exact-label teardown receipt are preserved. This batch includes no visual
inspection/detector/commit; parent owns the second finite inspection and final combined gates.

Historical pre-Round-1 observations (not current source identities or coverage):

Observed implementation verification (2026-10-12): web unit suite 26 files/329 tests passed; fresh
web production build and strict integration TypeScript passed; scoped integration ESLint passed.
Root reported unchanged full lint/typecheck/unit/build gates and all eight coverage workspaces
passed (web lines 98.78%, branches 92.22%; Property branches 84.86%). Serial selected campaign
session 44023 ran all three files: Search and Places passed; Property failed an executor-only
denied-label locator. After bounded executor fixes, Property-only session 39668 passed 1 file/1 test
in 53.26s with all seven semantic cases. Search/Places had exact-label owned resource absence
verified after their teardown. The final Property ledger audit and all 50 manifest SHA-256 checks
passed. These observations do not complete the separate final acceptance task.

**Commands:**

- `pnpm --filter @rei/web test` — all web tests including route/matrix regressions pass.
- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all eight workspaces
  and strict integration checking pass, unchanged gates.
- `pnpm run test:coverage` — unchanged existing thresholds pass.
- Run the following selected campaigns serially; resources must be removed without foreign effects:

  ```sh
  pnpm exec vitest run --config vitest.integration.config.ts \
    integration/web-property.integration.test.ts \
    integration/web-search.integration.test.ts \
    integration/web-place.integration.test.ts
  ```

- `pnpm exec prettier --check <changed-text-files>` and scoped markdownlint with `--no-globs` —
  formatting/docs pass without scanning unrelated rendered workflow files.

Parent inspects every named capture and rendered Property/desktop reference at authored dimensions,
validates all manifests/axe/interaction/ledger results, then performs finite finish handoffs and
BMAD review. Acceptance is not inferred from isolated unit tests or discovered campaigns.

## Auto Run Result

### Reviewed implementation — 2026-10-22

The public Property route now renders parsed backend facts in the inherited Placa system,
connects real Search rows, preserves applied Search return URLs and actual neighborhood context,
and hands Ask only an unexecuted state-held draft. Asking, absent Sale, dated history, removed
listing intervals, uncalibrated membership, feature agreement and permission-safe provenance stay
distinct. Missing contract data remains explicit under D-060/D-061; no backend calculation,
protected action, live source, model call or VPS operation was added.

Changed-file descriptions:

- `apps/web/src/properties/PropertyDetails.tsx` composes loading, failure, retained-data recovery
  and the complete read-only Property surface.
- `PropertyPlate.tsx`, `PropertyPrices.tsx`, `PropertyHistory.tsx` and `PropertyLifelines.tsx`
  present the returned identity, asking/no-sale distinction, dated changes and shared chronology.
- `PropertyEvidence.tsx`, `PropertyFeatures.tsx`, `PropertyProvenance.tsx` and
  `PropertySourceLink.tsx` expose truthful membership, reporters, safe source metadata and native
  local evidence destinations.
- `property-navigation.ts`, `property-presentation.ts` and `property-resources.ts` provide
  validated internal navigation, display-only geometry and bundled PT/EN copy.
- `routes.tsx`, `shell/AppShell.tsx`, `shell/PublicNavigation.tsx`, `places/place-queries.ts`
  and `search/SearchResults.tsx` connect the ID-only shared read, real neighborhood shell and
  Search/detail journey without eager detail requests.
- `main.tsx`, `places/locale.ts`, `places/resources.ts`, `styles/property.css` and
  `apps/web/vite.config.ts` register scoped presentation, localization and the local authored
  reference boundary while preserving the incumbent design system.
- Six web test/fixture files cover the matrix, presentation, safe navigation, locale and changed
  Search-link contract with native Vitest component tests.
- `integration/support/property-reads.ts`, `property-capture.ts`, `property-capture.test.ts`
  and `integration/web-property.integration.test.ts` provide typed real-HTTP oracles, independently
  framed captures and the owned production-stack/browser campaign.
- `integration/support/search-reads.ts` and `integration/web-search.integration.test.ts`
  preserve genuine Property links and remove the demonstrated positional retry-locator race
  without weakening assertions or retry policy.
- The epic Notes, scoped Property surface/finish/documentation records, integration guide and
  two historical goal handoffs preserve decisions, verification boundaries and resumability.
- Review artifacts retain immutable successful and failed synthetic campaigns, manifests,
  accessibility/interaction receipts and exact-label cleanup evidence; newer loose captures are
  not substituted for historical campaign bytes.
- `docs/property-commit-inventory-2026-10-22.json` lists every exact reviewed path by implementation,
  tests and documentation/evidence commit, including itself; all 1,296 paths are unique and complete.

Root completed own-context diff reading before launching Quick. The final implementation/evidence
checkpoint contained 82,989 lines with SHA-256
`040ab1750a38c2e970955f884e5c4495165484eb4f66c5cf8ffa62e36518e730`;
930 previously read blocks were byte-identical, and all changed blocks were read through exact
reused-line references plus every literal difference. Review metadata and the mechanically checked
commit inventory are the only later additions. The independent Quick review returned no findings;
five focused files/80 tests passed independently. Patches applied: 0. Deferred items: 0. Rejected
findings: 0. Patched entries by verdict: high 0, medium 0, low 0. Follow-up review recommendation:
`false`; no unverified patched risk was identified.

Verification includes the executed seven-row matrix, 332 web tests, 32 support tests, strict
integration TypeScript, unchanged eight-workspace coverage and the terminal joint Property/Search/
Places browser pass (session 99173, three files/three tests, 519.77 seconds). All 1,402 entries in
21 available evidence manifests matched before and after nonprotected formatting. The two finite
visual rounds, once-only detector, independent ship verdict and documentation disposition remain
complete; their identity and scope are recorded above.

Residual limits remain explicit: persisted unresolved is isolated parser-validated component
coverage, not exercised persisted API evidence; manual screen-reader/daylight/zoom acceptance is
not established by axe; D-060/D-061 do not claim pixel-identical document lengths or fill missing
backend data. No release/deployment readiness or whole-initiative completion follows from this
story's build result. VPS-dependent stories remain owner-blocked.

Final post-review root session 96434 completed the exact required
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` chain with exit zero:
all eight workspaces and 2,466 tests passed, including strict integration checking. The unchanged
large-chunk advisory remains a build warning, not a gate failure. The reviewed plan and new exact
commit inventory pass Prettier; scoped Markdownlint reports zero errors. The final build status is
`built`; orchestrator acceptance and ticket `done` are separate, subsequent steps.
