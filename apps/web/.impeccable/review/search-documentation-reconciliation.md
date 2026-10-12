# Search and Filters documentation reconciliation

Date: 2026-10-12. Outcome: reconciled as an ordinary extension of the incumbent Placa system,
candidate 4, seed `3d3cd1ae`. The existing `DESIGN.md`, `.impeccable/design.json` and `PRODUCT.md`
are preserved. This report records the finished surface and documentation drift; it introduces no
system tokens, component primitives or global visual rules.

## Evidence checked

- System and product: `apps/web/DESIGN.md`, `apps/web/PRODUCT.md`,
  `apps/web/.impeccable/design.json`, and
  `apps/web/.impeccable/surfaces/src-search-searchresults-tsx.md`.
- Implementation: `apps/web/src/styles/{tokens,components,search}.css`,
  `apps/web/src/search/{SearchResults,SearchFilters,SearchMedian}.tsx`,
  `apps/web/src/search/search-resources.ts`, and `apps/web/src/shared/PropertyRow.tsx`.
- Product semantics: Story 6.6's implementation plan and D-059 in
  `_bmad-output/initiative-real-estate-intelligence/epic-web/`.
- Independent visual disposition: `apps/web/.impeccable/review/search-finish-review.md`, which
  records `disposition: ship`, the complete visual matrix and no material fixes.
- Immutable ROUND2 evidence:
  `apps/web/.impeccable/review/campaigns/search-2026-10-12T13-46-38-040Z-207991e1/evidence/SEARCH-008-7/`.
  This reconciliation independently checked the manifest hashes and existing JSON reports; the
  finish reviewer supplies the visual inspection of all captures and authored references.

All 96 SHA-256 manifest entries match their files. The required Search/Filters × Bela Vista/city ×
390/960/1440 × pt-BR/en × full/top matrix contains all 48 PNGs. Their IHDR dimensions are 390×1706,
960×1366 and 1440×1366, with 16 images at each width. All 24 existing whole-page axe reports record
zero violations and zero incomplete checks. All 24 interaction reports include keyboard evidence,
record no horizontal overflow and report target heights of at least 44px. These are checks of the
retained evidence, not a new browser campaign or additional visual round.

The evidence manifest identifies local built JS/CSS hash
`e0ecd24a85d72da62542b5177ebab39b2865276d9e00c016bb24f7beb017093e` and source hash
`04a6c52f331e985429871bc01c622802f30b8e40ce502f69e7f72995a3705b95`, observed at
`2026-10-12T13:46:38.049Z`, against dirty baseline `f02018e3b2ac7201c44093ea83363dff08349233`. The
manifest explicitly limits that identity to the local build and owned web image. It does not
identify a VPS or production release.

## Incumbent system match

Palette: all 33 normative color entries in `DESIGN.md` match the corresponding declarations in
`tokens.css`. Search consumes the existing enamel blues, white Surface, cool Porcelain, ink,
hairlines, state colors and canonical geographical zone colors. It adds no color declaration or
alternate theme. The sidecar's canonical enamel, yellow, ink and zone metadata remains applicable.

Typography: Barlow Condensed continues to carry plate names and price figures; Barlow carries
readable controls, rows and evidence. Search's median uses the existing secondary figure step
(1.75rem), rather than a new type token. Rows retain the existing price step (1.375rem), body
(0.9375rem), secondary (0.8125rem) and provenance (0.75rem) roles. Locale formatting presents
backend values in BRL while canonical Portuguese place names remain unchanged.

Layout and form: the existing 16px mobile gutter, 24px desktop rhythm and 960px breakpoint remain
authoritative. Search preserves plate-first geography above compact count/chips/order, a result-set
median and ruled two-column property rows. Desktop keeps its 232px enamel rail and plate header. The
Filters form uses native controls and two columns at desktop sizes, with a surface-specific maximum
width of 960px; mobile keeps the authored standalone close bar and rounded form sheet. These
compositions extend the system without replacing it.

Material and named rules: the Two Prices, Zone, One Job, Tabular and Flat rules continue to apply.
Asking prices carry outlined tags; zone color identifies geography; yellow identifies the current
destination; figures remain aligned; ordinary rows and forms cast no shadow. The existing plate
inset and small control/panel radii remain intact. The Filters form explicitly removes the shared
sheet shadow because this editor is a standalone surface, not an overlay.

## Surface-specific invariants

| Surface or behavior           | Finished implementation and evidence                                                                                                                                                                                                                                                       | Scope                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Mobile Search                 | Existing brand/locale shell, navigation, plate, footer and tabs remain visible; compact controls precede median and ruled rows.                                                                                                                                                            | Search only; incumbent shell identity retained.                                                   |
| Mobile Filters                | Below 960px, the surrounding mobile shell/plate/navigation/footer/tabs are hidden while Filters exists. Its own enamel close bar, condensed uppercase title, grab and rounded white Surface form remain. Group spacing is 20px; range labels use secondary ink at weight 400.              | Authored Filters composition; does not redefine all screens or all headings.                      |
| Desktop Filters               | Existing rail/navigation/plate remains; the form is bounded to 960px, uses two columns and has 24px spacing.                                                                                                                                                                               | The editor's readable form width, not a new global container token.                               |
| Controls and chips            | Search chips wrap, have auto height and a 44px minimum. Filters bedroom segments and action buttons also retain at least 44px height. Native input/select controls and labelled disclosures remain keyboard operable.                                                                      | Scoped overrides of the incumbent compact chip/segment styles.                                    |
| Place selector                | Each option leads with its actual most-specific name and actual ancestors; the full selected canonical path wraps in a visible hint.                                                                                                                                                       | No invented location or hierarchy abbreviation.                                                   |
| Applied and draft state       | Applied filters and ordering are URL-backed. Filters owns a local draft; close cancels, clear changes the draft, and Apply uses the current successful server preview count.                                                                                                               | No frontend membership, ordering or median calculation.                                           |
| Search median                 | Uses the backend whole-result prepared median, explicit Asking and synthetic/prepared labels, metadata evaluation time and fixture version. The disclosure states that contributing sample and freshness are not reported.                                                                 | Does not inherit Overview's event-fed evidence or turn result count into contributor count.       |
| Neighborhood comparison       | Requests the same prepared unfiltered neighborhood basis only when a neighborhood is identifiable. City/zone scope supplies no fabricated neighborhood comparison.                                                                                                                         | Optional comparison with independent retry.                                                       |
| Property rows                 | Search passes no destination to `PropertyRow`, so each row is a semantic non-link inside a list. Identity/block is left; Asking values are right; comparison/listings/time wrap below. The default cursor and stable Surface background avoid implying a drilldown.                        | D-059 until the real Property route exists; linked consumers remain a separate variant.           |
| Empty recovery                | A named responsible group requires server prefix counts to transition from positive to zero. Relax removes that group; widen uses a real ancestor. Existing-zero and failed diagnosis retain neutral or retry states.                                                                      | No invented causal explanation or unavailable alert action.                                       |
| Prepared scope and pagination | Bela Vista has one actual prepared property; city scope has five. The readback labels synthetic version `synthetic-sao-paulo-v1`, evaluated at 2026-10-01 12:00 UTC. Twenty-row defaults expose no next page in this dataset; append proof uses separate smaller pages/component evidence. | No illustrative 212/1037 counts, extra fixture rows, Map/Alerts controls or acquired-data claims. |

## Documentation drift retained

The incumbent files contain earlier capability descriptions and constructed previews. Those
descriptions are not authoritative for Story 6.6's present availability or D-059 semantics:

- `DESIGN.md`'s Property row subsection still describes the shared row solely as a native link,
  states that Search is later work and says the row is exercised through a test-only fixture. The
  shared component now has an optional destination; Search deliberately uses its non-link variant.
  The sidecar's Property row description likewise says Search does not ship yet.
- `DESIGN.md`'s universal plate-first and Capitals descriptions do not mention the authored mobile
  Filters exception. Its independent uppercase close-bar title and hidden outer plate are confined
  to this surface and its brief, rather than promoted into new global rules.
- The general Figure description requires contributor/source/freshness evidence available to the
  live place figure. Search's prepared contract supplies different metadata and cannot satisfy those
  fields by invention. Its explicit limitations and row-source/date disclosure preserve provenance
  truth without pretending to be Overview's `Figure`/`MarketEvidence`.
- `PRODUCT.md` still describes the foundation as having no entities, collectors or business
  endpoints, and says routing/data-fetching libraries are absent. The inspected Search code uses the
  established React Router and TanStack Query shell and published prepared reads. Its earlier claim
  that tokens have not been checked against AA contrast is also not a description of the current
  scoped axe evidence; this report does not claim an exhaustive audit of every token.
- The sidecar retains constructed illustrations such as 1,037 properties, “Show 212 properties”,
  “Create alert” and a linked property preview. These are existing design-system snippets, not
  current Search counts, available workflows or evidence for any acquired dataset. The sidecar
  narrative abbreviates the fuller `DESIGN.md` wording; this pass does not regenerate it.

No craft-floor refusal was identified in the independent finish review. No defect or stale claim is
canonized into the design system. Drift is recorded here and remains unrepaired because this task is
an ordinary extension with explicit preservation of the incumbent documents.

## Preservation and limits

Only this reconciliation report is written. Before the write, `DESIGN.md` has SHA-256
`9df79d4f6606a93e117ee9b0b7f7de96313fe1bc98da29ce3c5e50048c2f209e`; the sidecar has
`2be76f55942cc626de77f97d3da183ba203585e03aba067b17a64d0a077c26b7`; `PRODUCT.md` has
`9a2c03cb932bbfbc0031a96b006e9384fda838d87fd1744e0928c2758a223552`.

This is a documentation reconciliation of the supplied local synthetic prepared-data surface, source
and retained finish evidence. It makes no claim about screen-reader speech, ambient-daylight use,
VPS/production deployment or equivalence to acquired data. No browser, capture, build,
context/detector invocation, product/design/source edit, commit or external operation is part of
this pass. The parent's independent integration acceptance and final story disposition remain
separate responsibilities.

## Subsequent evidence normalization

After this reconciliation, the parent preserved and verified the exact original bytes of all 464
changed JSON files in [a raw archive](search-preformat-raw-evidence.tar.gz), described by
[the provenance record](search-preformat-raw-evidence.json). Mandatory commit formatting is now
applied before hashing future surface JSON; the current reports/manifests are canonical derivatives
with updated hashes, while archived originals retain the evidence this pass checked. PNG and
incumbent DESIGN/sidecar/PRODUCT bytes are unaffected. This is an evidence-integrity correction, not
another visual round or a disposition for an unseen later version.
