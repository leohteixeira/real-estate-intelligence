disposition: fix

Inputs and limits: All 19 required captures were opened and are valid. This is an inherited,
code-led extension with no approved comp or separate QUALITY BAR card; calibration uses DESIGN.md,
Foundations.dc.html and the authored Listing reference as a critique reference only. Primary
implementation files and focused unit tests were read; integration/web-listing.integration.test.ts
was sampled at lines 1–120 and 660–880, and listing-fixtures.test.ts was not read. D-062/D-063 are
assessed through the decisions quoted in the supplied packet. No browser, detector, context loader,
tests or drift repair were run by this reviewer.

## persistence

Pass for the established visual world: PRODUCT.md, DESIGN.md, design.json, the Listing surface brief
and its matching design document exist. Candidate 4 and seed `3d3cd1ae` are explicit in FORM and
corroborated by docs/design/direction.md. The rendered world remains Placa. Comp-round approval,
reproduction state and comp-diff gates do not apply to this code-led extension.

The supplied detector result is an operationally incomplete run: exit 1, three nonexistent inputs,
no findings on accessible targets. It is not a clean overall gate. The actual resources.ts,
locale.ts and routes.tsx were read independently, alongside the Listing source. The supplied 7/7
semantic result and six geometry records establish their reported behavior, not fidelity or
universal evidence access. Existing stale foundation-era context is outside this review's repair
scope.

## fidelity

The authored reference's salient devices are its compact return/language bar, visible place
ancestry, bordered blue street plate with a zone strip, status band, explicitly tagged Asking and
deterministic calculation, ruled dated values, source provenance, timeline and compact bottom
navigation. Those devices inform the comparison; its fictitious counts, initial prices, raw
download, Operations link and interpreted amenities are not product requirements.

The matrix below judges the direction contract and incumbent world, not reproduction of the
critique-reference image.

| Promise or element                                   | State                                                   | Evidence and scope                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TYPE                                                 | Match                                                   | Local Barlow Condensed retains the narrow, upright capitals and figure character; Barlow carries readable controls and facts. All six top captures preserve the hierarchy and outlined Asking tag without shrinking the street lettering.                                                                                                                                                                                                |
| MATERIAL                                             | Match                                                   | The flat enamel palette, double-edge plate, zone strip and ruled evidence are the world's permitted web vocabulary. There is no painted or photographic asset promise, fake bevel, hard shadow or absent raster plate to reconstruct.                                                                                                                                                                                                    |
| GROUND                                               | Match                                                   | The captures retain the cool porcelain field and white desktop panels against the saturated enamel shell. OWN-WORLD and DESIGN.md supply the authority: Porcelain `#f4f6f9`, Surface `#ffffff`, Enamel 800 `#0b2c6b`. This is a visual/source comparison, not an independent pixel measurement.                                                                                                                                          |
| THESIS: one publication, distinct from Property      | Match                                                   | Source and verified position sit on the plate; the status band explains the publication/property distinction; publication Asking and its provenance remain explicit.                                                                                                                                                                                                                                                                     |
| FIRST VIEWPORT: phone                                | Match                                                   | Both 390px top captures show return, languages, native ancestry, street plate, status and Asking in the promised order. The source/position line carries publication identity rather than decorative eyebrow copy.                                                                                                                                                                                                                       |
| FIRST VIEWPORT: desktop                              | Match                                                   | At both 960px and 1440px the 232px rail and blue header remain, provenance pairs with values, and events pair with description. Native 44px controls and fuller evidence account for the extra height under the supplied acceptance decisions.                                                                                                                                                                                           |
| STORY: independent context and exact return          | Match in reviewed source and supplied behavior evidence | Listing and Property use separate cached reads; verifiedListingProperty checks identity, membership and position before ancestry/count appear. Failure leaves Listing readable. propertyHref and validSearchReturn preserve the validated applied Search URL.                                                                                                                                                                            |
| FORM: original events and corrected versions         | Match in reviewed source and supplied behavior evidence | History keeps original event hashes/provenance in native disclosures; permitted corrected versions remain a separate dated list. Denied descriptions render dates and the source link without a body or comparison control.                                                                                                                                                                                                              |
| Dated field evidence available to every input method | Contradicted                                            | The facts crops show concise dates such as `01/10/2025` and `01/03/2026`, but ListingFacts.tsx:137 exposes the complete UTC timestamp only in `title` on a nonfocusable `time`. No native disclosure, visible full timestamp or keyboard/touch action exposes each field-effective instant. The unit test asserts the attribute's presence; the browser helper checks `datetime`, so neither verifies usable access to that information. |
| Truth, locale and evidence boundaries                | Match in reviewed source and supplied behavior evidence | Synthetic data is labelled; canonical street/source names and source-authored English description remain unchanged in PT. Money formats switch locale. Unknown retained count/expiry, null versus zero, removal versus sale, server metric/formula and escaped permitted text remain explicit. The reference's unsupported commercial/history values and protected actions have not been copied.                                         |

## ceiling

Reached for the inherited Operate visual vocabulary, subject to the field-timestamp access fix. The
frame, condensed lettering, zone colour, low ornament density, ruled table and event line use the
native Placa devices. Flatness and the lack of entrance motion agree with Foundations; additional
texture, illustration, depth or animation would add an unsupported material obligation. The
reference is more compact, but its smaller targets and less complete evidence do not justify
compressing the delivered controls or removing native provenance. With no separate QUALITY BAR card
or approved comp, this is a calibration against the authored system, not a claim of measured comp
reproduction.

## material_fixes

1. [P2 · STORY / evidence coverage / keyboard and touch] In
   apps/web/src/listings/ListingFacts.tsx:137, expose every `fieldEffectiveAt` timestamp, including
   UTC time, through visible text or a native disclosure operable with touch and keyboard; retain
   the concise table dates if desired, but do not make `title` the sole route to the complete
   instant. Verify actual access in PT/EN at 390px and desktop, with an attributes timestamp
   distinct from collection/history dates so another section cannot accidentally satisfy the check.
   This is one bounded ListingValues fix and its verification; it does not require a redesign, new
   asset or wider context repair.

## keep

Keep the Placa plate/type/palette, phone reading order, desktop panel pairing, 44px native
disclosures, source-permission boundary, original event hashes, independent verified Property
context, exact Search return and honest unknown evidence while exposing complete field timestamps.
