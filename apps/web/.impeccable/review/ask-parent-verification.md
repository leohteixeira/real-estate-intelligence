# Ask completed-run parent verification

Date: 2026-10-22. Baseline: `b5fc8d3b1d3a186249c0f7b0257cdbd91a593250`.

## Independent checks

- Exact root chain `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`: passed
  (2,584 tests across eight workspaces). Existing bundle-size advisory remains; no threshold or
  exclusion changed.
- `pnpm run test:coverage`: passed all unchanged workspace floors.
- Focused `pnpm --filter @rei/web exec vitest run --dir src src/ask --reporter=verbose`: seven
  files, 63 tests passed. Parent read the actual new product and test files, route/resource/style
  changes, integration campaign and evidence helper.
- `pnpm run test:integration:list`: passed.
- Prepared-contract integration: two tests passed.
- Independent Ask browser integration: passed, all seven declared scenarios approved. Owned
  production web/API/PostgreSQL only; no worker, model or external collection.

## Historical immutable campaign, before final correction

`campaigns/ask-2026-10-22T10-14-56-415Z-44cb0bea/`

Parent recomputed all 54 surface-manifest SHA-256 values: no mismatch. All 47 before/after SQL table
counts/digests remain unchanged. Teardown receipt reports owned resources removed and foreign
resources preserved. Asset identities distinguish the local build from the container runtime; no
cross-build reproducibility claim is made.

The twelve-file source hash was independently recomputed as
`2ce6f35b03ec5856a0a7a6637891b4e3a9ecdaf959beb2c150d54ad5ae5b5583`, matching the campaign. Parent
also independently queried Docker by this exact campaign's Compose project label: no owned container
or volume remains. All nine axe JSON reports were read: zero violations and zero incompletes. All
nine interaction records report no overflow and top/full scroll origin `(0,0)`; fonts report loaded
local Barlow and Barlow Condensed.

## Matrix audit

Every intent row has an actual executed passing check, not merely a test declaration. Parent's
verbose focused run included all parameter rows named in the plan's implementation checkpoint; the
browser run's immutable attempts independently record seven approved scenarios.

| Intent row             | Executed covering checks                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prepared completion    | AskScreen explicit-follow/completion test; ASK-001 actual backend oracle and terminal/result/step comparison                                         |
| Draft/place            | AskScreen escaped unsent draft/invalid-state/place tests; ASK-002 native Overview/Property handoffs, editing, locale and place reset                 |
| Missing evidence       | AskRunRecord bilingual exact-result/absence and binding/null tests; ASK-001/006 rendered truth                                                       |
| Framing/validation     | ask-stream split UTF-8 and LF/CR/CRLF/comments/multiline/size/malformed tests; ask-session immutable-identity and sequence tests                     |
| Interrupted stream     | ask-client JSON/header/next-frame ten-second deadlines, comments and noncooperative cancellation; ASK-004 actual truncated/corrupt SSE               |
| Replay/terminal        | ask-session exact duplicate/conflict/gap/post-terminal; ask-client one cursor resume/terminal no-reconnect; AskScreen no fixed-GET rollback; ASK-004 |
| Read/authority failure | ask-client 401/403/404/503 and request-ID/body sanitization; AskScreen manual recovery; ASK-003                                                      |
| Ownership/lifecycle    | ask-client abort/release/no-reconnect; AskScreen unmount cache isolation; ASK-005 observes abandoned request failure before held response release    |
| History/unavailable    | AskThread native selection and AskRunRecord unavailable no-price; AskScreen actual history/current; ASK-001 Search recovery                          |
| Locale/reflow/a11y     | Bilingual presenter/screen tests; ASK-006 six width/locale combinations, keyboard/focus/disclosure/geometry/axe; ASK-007 fixed authored references   |

Parent Verify additionally found a cleanup-outcome bookkeeping defect: the original harness could
write a successful receipt after `fixture.down()` rejected, despite failing the test. Implementation
repair and deterministic failure-path coverage are required before review. Historical passing
execution above remains historical evidence; it does not prove that rejected-cleanup path.

## Visual inspection, bounded parent round 1

Parent opened every one of the 36 PNG files named by the manifest: PT/EN completed
top/full/record/thread captures at 390/960/1440; PT history, interrupted and failed-read captures;
fixed authored references at 390×2034 and 1440×1142. No blank, black, half-loaded or mislabeled
captured surface observed. Full captures start at the document top; regional files show their
declared record/thread. The viewport captures intentionally end at their declared viewport height
while full-page captures retain all content. Font readiness, reduced-motion capture,
keyboard/focus/disclosure, 44px targets, no horizontal overflow and zero axe violations/incompletes
are checked by the campaign. These are automated/local-browser evidence, not a human screen-reader,
daylight or physical-device zoom assessment.

The incumbent Placa palette, plate/zone strip, Barlow typography, rail/mobile navigation and native
disclosures are preserved. The authored examples contain future product facts; D-043/D-066/D-067
require replacing unsupported model/citation/quota/retention/trace claims with honest prepared-basis
availability. Real returned Pinheiros binding stays separate from Bela Vista navigation and the
unsent draft. No material parent visual correction identified in this bounded inspection.

## Single detector invocation

From `apps/web`:
`impeccable detect --json src/ask src/styles/ask.css src/routes.tsx src/main.tsx src/places/resources.ts`.

Exit code 0; exact output: `[]`. This static detector is not whole-surface accessibility or behavior
approval. Fresh finish reviewer and documenter remain required.

## Final verification and bounded parent round 2

The historical cleanup observation above is resolved by `runAskCampaign`: completion follows work,
browser release and successful owned-stack teardown; rejected teardown cannot set the removed flag
or teardown timestamp. Five new failure-path lifecycle tests plus the four existing shared lifecycle
tests passed independently (nine total). The documenter's running-badge observation was also
resolved: the record uses the incumbent `st--running` class, covered by an additional regression
test; no shared token or stylesheet was changed for this correction.

After both corrections, parent reran the exact root lint/typecheck/test/build chain successfully:
2,585 tests across eight workspaces (contracts 183, domain 649, AI 212, web 451, application 222,
infrastructure 444, API 197, worker 227). Coverage passed all unchanged floors. Focused Ask
verification passed seven files and 64 tests, including the running-class regression; integration
discovery passed; the prepared-contract integration passed two tests; the browser integration passed
all seven scenarios. The matrix above remains covered by these actual final executions, not just
declarations.

Final immutable campaign: `campaigns/ask-2026-10-22T10-27-15-811Z-81622909/`. Its twelve-file source
hash was independently recomputed as
`54cd3a423423a1032fbf03cb49d35b539d9929108d4edc4c24ac85aca80174de`. Parent verified all 54 manifest
hashes and unchanged before/after counts and digests for all 47 SQL tables. The campaign reports
completion, successful owned-resource removal and foreign-resource preservation. Independent
exact-project-label Docker queries returned no remaining owned containers or volumes.

Parent opened all 36 final PNGs, not reused historical captures: completed PT/EN at 390/960/1440,
history, interrupted read, failed read, their top/record/thread crops, and both fixed authored
references. The interrupted record visibly uses the incumbent blue running badge. No new material
visual correction was identified. All nine current accessibility reports have zero violations and
zero incompletes; all nine interaction reports have no horizontal overflow, loaded Barlow/Barlow
Condensed, targets at least 44 by 44 CSS pixels, and top/full capture origins `(0,0)`. Reference
images are structural authored comparisons, not claims of pixel identity with unsupported future
model, retention or quota facts.

This is the second and final bounded parent visual round. The single detector invocation above was
not repeated. Human screen-reader, daylight, physical-device zoom, live model execution and durable
browser recovery remain outside this local evidence; final finish-review and documenter
confirmations are recorded separately.

Parent read both complete final confirmation documents. The finish reviewer reopened all 36 current
PNGs, read all 18 reports and returned `ship` with all five required contract sections; no material
correction or recapture remains. The documenter confirmed the corrected running treatment and
cleanup evidence, and unchanged incumbent DESIGN.md/design.json. Their exact scope, attribution and
historical provenance are preserved in those separate records.

## Subsequent BMAD review — candidate not accepted

The Quick lens subsequently returned four findings, all independently confirmed by parent and
classified medium/bad_plan in review pass 1: valid complete SSE prefixes lost before a trailing
malformed UTF-8 byte; semantic snapshot comparisons depending on JSON member ordering; rounded
fractional area operands; and attempt evidence failures masking the action error/ledger. These are
correctness gaps despite the passing final matrix above, not a new design/polish judgment. The plan
records the exact evidence and amendments outside its immutable intent. The attempted code was saved
reversibly in `.ignore/ask-positive-preservation-2026-10-22.patch`, then reverted for the prescribed
implementation re-derivation. Existing campaign evidence remains immutable.

Consequently the passing commands, visual verdict and source hash above describe that preserved
candidate only. They do not constitute acceptance or verification of the re-derived candidate. No
commit or ticket completion occurred before this review. Fresh behavioral tests, full gates,
prepared contracts, owned browser evidence and scoped source/artifact documentation confirmation are
required after the corrections; the finite design review and single detector are not reopened.

## Independent verification after R1–R4 re-derivation

The parent independently read the repaired product, tests and actual attempt/campaign callers. R1
now admits complete envelopes before decoding a later malformed UTF-8 suffix. R2 compares typed
snapshot fields semantically while retaining byte-exact duplicate detection. R3 preserves the
accepted fractional area operand with Ask-local formatting; no backend result is recomputed. R4
independently attempts evidence and ledger reporting and preserves action and subsequent failures,
including falsy thrown values. The preserved candidate above is not the current proof.

After the final source changes the parent executed, successfully:

- Exact root lint/typecheck/test/build chain: 2,608 tests across eight workspaces, including 474 web
  tests. The existing bundle-size advisory remains non-fatal and unchanged.
- Coverage: all eight unchanged floors passed; web statements 96.20%, branches 90.51%, functions
  96.99%, lines 97.29%.
- Focused Ask suite, verbose: eight files, 87 tests; every named covering test ran and passed.
- Attempt/campaign/Search helper suite, verbose: three files, 18 tests, including all nine attempt
  failure/success cases and five Ask campaign lifecycle cases.
- Integration discovery: the actual browser campaign, both prepared-contract cases and helper cases
  are registered, without skipped or empty success.
- Prepared-contract integration: two tests passed, 44.81 seconds total.
- Independent owned browser integration: one test passed, 148.76 seconds total; all seven declared
  scenario attempts are approved.

The matrix audit above still maps each intent row to actual passing checks. The additional R1
partition/UTF-8/EOF/CRLF bounds and client cursor/cancellation regressions, R2 independently parsed
reordered snapshots and actual-change rejection, R3 PT/EN exact fractional/tiny operands, and R4
primary/capture/write/report aggregation cases all appear in the passing verbose outputs. Test
declarations alone were not treated as execution evidence. The parent's local command logs are
ignored work artifacts, not additional campaign evidence.

Current primary immutable parent campaign: `campaigns/ask-2026-10-22T10-57-38-613Z-bc1dc6e3/`. The
separately executed implementer campaign at 10:49 is corroboration, not substituted parent proof.
Parent recomputed the thirteen-file source hash as
`c1555e9c69ec1fee8096f34278537817ff92c224e2a5746aa087d96b81fa4182`, matching current files and
version metadata. All 54 manifest file hashes match. All 47 SQL before/after table counts and
digests are unchanged. All seven attempt evidence references exist. HTTP-served and browser-observed
assets match the exact owned runtime assets; host/runtime build identities remain separate, without
a reproducible-build claim.

The current campaign reports complete with owned removal and foreign preservation at
`2026-10-22T11:00:05.382Z`. Independent exact-project-label queries for
`rei-web-ask-d6e78681-7d4c-4f56-bc7e-41491f2b7933` returned no owned containers or volumes. All nine
current axe reports have zero violations and incompletes; all nine interaction records report no
horizontal overflow, loaded Barlow/Barlow Condensed, minimum target dimensions 44px, and full/top
capture origins `(0,0)`.

This is factual confirmation after correctness repairs, not a third visual/polish round. Of the 36
current PNGs, 29 are byte-identical to the 10:27 campaign already inspected in full during bounded
round 2. Parent directly opened the seven changed current files: failed-read 390 PT, interrupted 390
PT, completed 390 PT, completed 390 EN/full and top, completed 960 EN/full and top. Each shows its
declared state/region with the incumbent composition and running treatment; the integer prepared
result, actual Pinheiros binding, independent Bela Vista navigation, availability statements and
unsent draft remain intact. This is not a claim that the parent reopened all 36 files again. No
further polish or detector invocation occurred. Scoped finish and documentation confirmations follow
in their separate records; human/device/live/deployment limits and reported pre-existing global
documentation drift remain unchanged.

Parent subsequently read both complete updated confirmation records for this exact campaign. The
finish reviewer returned `ship` with all five required contract sections, independently checked the
repaired source/evidence identity, and opened all seven changed current PNGs. No material correction
or recapture remains. The documenter reconciled the final parent campaign, historical provenance and
R1–R4 repairs without changing the incumbent global design documents. Their direct checks and
attributed parent executions remain distinguished in the separate records. These confirmations
complete the scoped verification gates; renewed BMAD Quick review is still required before
acceptance or commits.
