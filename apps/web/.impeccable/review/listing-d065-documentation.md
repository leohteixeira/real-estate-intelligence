# Listing D-065 documentation recheck

Recorded on 2026-10-22 by the shipped Impeccable Documenter. This is a separate, bounded supplement
to `listing-documentation.md`; the earlier report remains a historical D-064 record, not a D-065
approval.

## Preservation outcome

D-065 remains an ordinary extension of the incumbent Placa world. It changes the Listing-only
context read boundary and adds received fixture metadata within an existing disclosure. It does not
introduce a new world, approve a design-system change, or create reusable visual tokens.
`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json` and the original documentation report are
preserved byte-for-byte. This documentation pass writes only this new report.

The shipped documenter definition and `reference/document.md` ordinary-extension rule govern this
pass: finished source is evidence, incumbent system files remain authoritative, and existing drift
is reported rather than repaired. The Listing direction contract and repository
`docs/design/listing-surface-brief.md` retain candidate 4, seed `3d3cd1ae`, and the inherited
code-led direction. There is no approved generated comp; the authored HTML/image reference remains
critique evidence rather than an approved replacement system.

Preservation identities, SHA-256, relative to `apps/web` (checked before and after the documentation
write):

| Preserved file                                | SHA-256                                                            |
| --------------------------------------------- | ------------------------------------------------------------------ |
| `PRODUCT.md`                                  | `9a2c03cb932bbfbc0031a96b006e9384fda838d87fd1744e0928c2758a223552` |
| `DESIGN.md`                                   | `9df79d4f6606a93e117ee9b0b7f7de96313fe1bc98da29ce3c5e50048c2f209e` |
| `.impeccable/design.json`                     | `2be76f55942cc626de77f97d3da183ba203585e03aba067b17a64d0a077c26b7` |
| `.impeccable/review/listing-documentation.md` | `a25ac702fd8e092cbf89d983f40da364f5a7ff8428f41ddccfde4d7beb832788` |

## Five-line incumbent system summary

1. Palette: enamel shell `#0b2c6b`, enamel plate `#0f3a8a`, porcelain `#f4f6f9`, white surfaces and
   dark ink; geographic zone color is not a truth or price signal.
2. Type: Barlow Condensed carries street capitals and figures; Barlow carries controls and reading
   text, retaining the established body, small and provenance hierarchy.
3. Layout: the existing 4px spacing base, 16px phone/24px desktop gutters, 232px rail, 960px
   paired-panel threshold and native 44px control targets remain the vocabulary.
4. Named color rules: One Job, Zone, Neutral Movement and Two Prices preserve current-location,
   geography, state/movement and explicitly labelled Asking semantics.
5. Named type/depth rules: Capitals, Tabular, Locale and Flat retain lettering, numeric alignment,
   localized presentation, hairlines and tonal surfaces without new ornamental depth.

## Finished-source changes

The recheck read `src/listings/ListingFacts.tsx`, `ListingDetails.tsx`,
`src/places/place-queries.ts`, `src/shell/AppShell.tsx`, the relevant bilingual Listing resources
and tests, and the previous report. No implementation was changed.

| D-065 boundary                       | Source evidence and consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared Listing-only context          | `listingPropertyQuery` supplies the same `['listing-property-context', id]` key and query function to `ListingDetails` and `AppShell`. Ordinary direct Property routes still use `propertyQuery` and its separate `['property', id]` key. The deadline is not a new global Property policy.                                                                                                                                                                                    |
| Bounded response and body            | The Listing context function races the complete parsed `client.property` promise against a 10,000ms deadline, aborts the request at the deadline, and rejects with a public `PlaceReadError(0)`. Thus the bound includes a stalled response or body parse, rather than just response headers.                                                                                                                                                                                  |
| Cancellation and cleanup             | An already-aborted navigation is rejected before a request/deadline is installed. Subsequent cancellation preserves the signal reason and aborts the request; `finally` clears the timer and removes the listener on success, failure, deadline or cancellation.                                                                                                                                                                                                               |
| Independent manual recovery          | The shared read policy disables automatic retry, focus refetch and reconnect refetch. A failed context leaves Listing facts readable and verified ancestry/count absent. The context action refetches context independently of the Listing read; membership verification still gates Property-derived identity and position.                                                                                                                                                   |
| Received synthetic evidence metadata | `ListingFacts` renders raw `listing.fixtureLabel` as a definition-list value inside the existing identifier/hash disclosure. The localized label is “Synthetic evidence label” / “Identificação da evidência sintética”. The localized caveat distinguishes prepared from persisted synthetic evidence while explicitly saying snapshot availability does not determine that origin. The implementation does not classify the received string or infer origin from a snapshot. |

The D-064 native complete-times disclosure remains present. D-065 reuses the current flat evidence
panel and native disclosure device, not a new card, badge, color code or type scale. The raw fixture
string remains received evidence even when its language differs from the UI locale; the explanatory
label and caveat are localized.

Test source was inspected, not executed. `place-queries.test.ts` explicitly covers shared
key/function/no-retry policy, stalled response and body, the 9,999ms/10,000ms boundary, abort,
timer/listener cleanup, no delayed automatic retry, subsequent independent recovery, success/public
failure cleanup and navigation cancellation in both stalled phases. `ListingDetails.test.tsx` covers
both locales with prepared and persisted label examples, disclosure visibility and exact raw
strings/caveats. Its shared shell/screen deadline case retains Listing content, removes unverified
count, keeps the neutral Search destination, observes one context request, and recovers context
without a second Listing read. These are reviewed assertions, not fresh test results.

## Immutable build evidence inspected

The D-065 evidence base is `campaigns/listing-2026-10-22T08-54-05-065Z-edd0cb18/`, relative to this
report. The documenter read its `artifact-readback.json`, `surfaces.json` selected entries,
`results/report.md`, all seven `results/attempts.jsonl` entries, the context deadline receipt and
the Portuguese phone metadata receipt. The stored attempts record seven approved semantic scenarios
without executor errors; this reports those saved outcomes, not independent re-execution.

Recorded source identity: `e87eb778365ce7567648586e8c2a0b9b5a0acb99a2676f8092fe838374deb83e`.
Recorded served web artifact identity:
`2254e7f8f4798207f08092ad7a859ce13a558e685df80cb531d927a58f7a5977`. The readback separately records
local web artifact `875aad97f1623be5e7957b27747747152bf08a5a82e8ac1b9e456933f66d9358` and image
`sha256:ada93a2b59cac3839097dcbaa1954653cfab04a41ecf0a9487c221e8a0772a4e`; the local and served
aggregate hashes are not claimed equal. Its three served-asset entries record matching built/served
hashes. The CSS asset remains `index-DDzKhezc.css`, hash
`de3eafa7f32ddb3c2c33a66e243be0edb452f2bbcd516c191f986d11bb9294e8`, consistent with the preceding
D-064 evidence. These are receipt identities, not a newly rebuilt or recomputed artifact identity.

Exactly these seven existing images were opened during this D-065 documentation pass:

- `evidence/LISTING-006-6/listing-104-390-pt-BR-metadata.png`;
- `evidence/LISTING-006-6/listing-104-390-en-metadata.png`;
- `evidence/LISTING-006-6/listing-104-960-pt-BR-metadata.png`;
- `evidence/LISTING-006-6/listing-104-960-en-metadata.png`;
- `evidence/LISTING-006-6/listing-104-1440-pt-BR-metadata.png`;
- `evidence/LISTING-006-6/listing-104-1440-en-metadata.png`;
- `evidence/LISTING-005-5/listing-context-deadline-390-pt-BR-top.png`.

All six sampled metadata images visibly retain the current porcelain/white evidence ground, ruled
label/value vocabulary, native disclosure focus and text hierarchy. The received “Authoritative
synthetic monthly replay” string is visible in both locales, alongside the localized caveat, without
a new visual classification. Long metadata wraps at the intermediate width; this is not an assertion
that the column proportions are acceptable. The phone deadline image retains the Listing street,
Asking and facts while showing the localized context-unavailable alert and manual retry; it does not
present verified ancestry or a verified position/count.

The deadline receipt supplies the timing/network facts that a static image cannot:
`deadlineMs: 10000`, `elapsedMs: 10102`, one stalled read, cancellation `net::ERR_ABORTED`, and
unchanged Listing-read count before/after recovery (9/9 in that scenario's accumulated counter). It
records recovered membership `0199a3e0-0000-7000-8000-000000000104`. The inspected phone metadata
receipt records keyboard opening and identical expected/observed raw fixture labels. Source/test
inspection supplies response/body and cleanup boundaries; the screenshots alone do not prove those
internals.

## Scope, later review finding and unrepaired drift

This is a documentation/preservation recheck, not a D-065 ship verdict or a fresh whole-surface
aesthetic review. While this report was being written, the parent supplied the narrow review
outcome: `fix`, for a P2 in the first metadata definition list at 960px Portuguese, where the new
long term starves the value column. That supplied finding is not independently re-reviewed here and
is not canonized as acceptable layout. A bounded Listing-scoped correction and new captured build
were still in progress at that update. Therefore this report's `e87eb778…` source and `2254e7f8…`
runtime evidence are historical scope, not certification of a final corrected artifact; a last-edit
recheck remains required. The historical D-064 bounded `ship` verdict resolves its timestamp finding
only and is not automatically extended to these later edits. No all-33-image inspection is claimed:
seven images were opened here.

The existing foundation-phase/no-router/no-data-fetching product description still differs from the
incumbent Router/TanStack source. Existing design navigation describes five phone destinations and
Operations while the public shell has Places, Search and Ask; the sidecar/Markdown also contain
older Property/Search workflow descriptions. These discrepancies are not repaired or promoted into
new rules. The pre-existing build-path configuration warning remains reported and unrepaired; its
exact original path/text is not invented. The prior detector result remains incomplete because three
targets were inaccessible (`src/places/place-resources.ts`, `src/places/locale.tsx`,
`src/routes/routes.tsx`), not a clean gate.

No context loader, detector, live browser, build, test, server, asset generation, commit or Git
mutation was run by this documentation pass. Human screen-reader, daylight and zoom checks remain
outside the supplied executed evidence. Prepared read evidence does not establish persisted
correction, revocation or expiry; the previous provenance campaign remains separately necessary. No
production-data, universal accessibility, measured comp-reproduction or new shipping-raster claim is
added. The existing system, original report and implementation remain unchanged by this pass.
