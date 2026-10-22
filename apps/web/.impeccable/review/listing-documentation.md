# Listing documentation evidence

Recorded on 2026-10-22 by the shipped Impeccable Documenter during the Listing finish handoff.

## Preservation outcome

The finished Listing surface is an ordinary extension of the incumbent Placa world. No new world or
design-system change was approved or introduced. `PRODUCT.md`, `DESIGN.md` and
`.impeccable/design.json` remain untouched; this report is the only file written by this
documentation pass. Listing composition and evidence behavior remain local to its surface brief
rather than becoming new global design rules.

The operating instructions were read from the shipped `engine/skill/agents/impeccable-documenter.md`
and `reference/document.md` under `/home/vscode/.codex/skills/impeccable-v2`. The documenter's
ordinary-extension rule applies: preserve the incumbent system and report existing drift without
repairing it. No context loader, detector, browser, server, test, build, commit or asset generation
was run during this pass.

System files inspected, with SHA-256 identities recorded before writing this report:

| File, relative to `apps/web` | SHA-256                                                            |
| ---------------------------- | ------------------------------------------------------------------ |
| `PRODUCT.md`                 | `9a2c03cb932bbfbc0031a96b006e9384fda838d87fd1744e0928c2758a223552` |
| `DESIGN.md`                  | `9df79d4f6606a93e117ee9b0b7f7de96313fe1bc98da29ce3c5e50048c2f209e` |
| `.impeccable/design.json`    | `2be76f55942cc626de77f97d3da183ba203585e03aba067b17a64d0a077c26b7` |

## Five-line system summary

1. Palette: enamel shell (`#0b2c6b`), enamel plate (`#0f3a8a`), porcelain ground (`#f4f6f9`), white
   surfaces and dark ink; zone colors identify geography.
2. Type: Barlow Condensed carries place capitals and figures; Barlow carries controls and reading
   text. The Listing block name uses `1.75rem`, the principal figure `3rem`, body `0.9375rem`, small
   text `0.8125rem` and provenance `0.75rem`.
3. Layout and shape: a 4px spacing base, 16px phone gutters, 24px desktop gutters and a 232px rail;
   paired evidence panels begin at 960px, with native 44px control targets and the incumbent
   small-radius plate/control vocabulary.
4. Named color rules: the One Job Rule reserves yellow for current location, the Zone Rule reserves
   zone color for place, the Neutral Movement Rule separates movement from state, and the Two Prices
   Rule identifies Asking explicitly.
5. Named type and depth rules: the Capitals, Tabular and Locale Rules govern lettering and data; the
   Flat Rule uses hairlines and tonal surfaces, reserving shadows for overlays.

These lines describe the existing system observed in source and the sampled build evidence. They do
not replace its normative tokens or establish new reusable tokens from Listing-specific values.

## Finished source against the incumbent

The Listing surface contract and repository `docs/design/listing-surface-brief.md` agree on Operate
mode, candidate 4, seed `3d3cd1ae`, and the inherited code-led path. `docs/design/direction.md`
corroborates that origin. No generated approved comp exists. The authored Listing image is a
critique reference, with product facts and permissions governed by the public data contract and
accepted implementation decisions.

| Durable incumbent behavior                           | Finished-source evidence and implication                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Place and publication identity precede the figure    | `ListingPlate.tsx` renders the street plate, source and verified position. `ListingDetails.tsx` preserves phone return/language, ancestry, plate, status and publication Asking order.                                                                                                                       |
| The world lends type, palette, density and its plate | `tokens.css`, `listing.css` and the inherited property styles use the existing enamel/porcelain palette, Barlow family, ruled rows and native controls. Listing adds no palette, display face, shadow or ornamental material.                                                                                |
| Standard responsive application layout               | The 960px rules pair provenance with values and events with description. The desktop Asking section joins the blue header; phone evidence stacks under its white Asking band. `AppShell.tsx` and `PublicNavigation.tsx` retain the existing rail/tab devices and mark Search current for detail routes.      |
| Complete evidence remains inspectable                | `ListingFacts.tsx` renders public source, collection and snapshot metadata, with native identifier/hash disclosure. `ListingHistory.tsx` retains dated original events, original hashes and per-event provenance.                                                                                            |
| Property and Listing are distinct                    | Separate reads and `verifiedListingProperty` require identity, membership and position before Property ancestry/count appear. A context failure leaves the Listing readable. The return link uses the existing validated Search-return helpers.                                                              |
| Permission and calculation boundaries remain visible | The Asking figure presents the supplied backend metric and public formula. Unknown evidence remains unknown. Description rendering escapes permitted text; denied descriptions expose dates and source without current or historic body text. Corrected versions remain distinct from original event hashes. |

No new shipping raster is introduced by the inspected Listing components. The PNG files used below
are review evidence, not product imagery. The existing SVG navigation icons remain source-rendered.

## Captured build evidence and finish disposition

Authoritative final campaign, relative to this report:
`campaigns/listing-2026-10-22T08-31-04-848Z-ae910bf5/`. The original finish packet names an earlier
campaign; the final verdict and the final section of repository
`docs/design/listing-parent-comparison.md` explicitly identify this newer campaign as the D-064
artifact. Historical campaigns and their failures are not promoted to final evidence.

This documenter opened five existing immutable images:

- `evidence/LISTING-006-6/listing-104-390-pt-BR-top.png`;
- `evidence/LISTING-006-6/listing-104-1440-en-top.png`;
- `evidence/LISTING-006-6/listing-104-390-pt-BR-complete-times.png`;
- `evidence/LISTING-006-6/listing-104-960-en-complete-times.png`;
- `evidence/LISTING-007-7/listing-reference-390x1782.png`.

The sampled phone and desktop images visibly retain the plate/type/material hierarchy and the light
evidence ground. Both sampled open-state crops show eight labelled full UTC times and native focus
treatment. The authored reference supplies the recognizable plate, status, Asking, table and
timeline vocabulary; its fictitious commercial facts, protected/raw actions and interpreted
amenities are not copied into the system.

The parent and finish reviewer report opening all 25 required final captures. This documentation
pass sampled five and does not claim to have independently opened all 25. It also read the original
`listing-finish-review.md`, final `listing-finish-verdict.md`, campaign `artifact-readback.json`,
`results/report.md`, append-only `results/attempts.jsonl`, one complete-times JSON receipt, the
detector record and the final parent-comparison clarification.

The original review remains `disposition: fix`. Its sole P2/D-064 finding was complete
field-effective timestamps available only by hovering a nonfocusable concise date. The final verdict
is `disposition: ship` for that scored fix only. It does not replace the original review with a new
whole-surface aesthetic approval.

The finished `ListingValues` now reuses its eight table rows in a localized native
`details`/`summary` disclosure, with field labels and full formatted UTC `time` values. The concise
table dates remain. `listing-resources.ts` supplies both `Ver horários completos (UTC)` and
`View complete times (UTC)`. This extends the incumbent native evidence-disclosure device without
changing the visual world.

The two-locale unit case was read, not rerun: it substitutes the attributes instant
`2026-05-14T09:37:00.000Z`, proves it differs from collection and history instants, then checks the
six attribute fields alongside Asking and Description. The sampled browser receipt records
`keyboardOpened: true` and all eight exact field-effective instants. Its canonical attributes
instant coincides with creation/first collection; therefore browser evidence supports mapping and
interaction, while the unit case supplies timestamp distinctness. The final verdict records both
scopes and reports all six locale/viewport combinations.

The stored campaign attempts record seven approved semantic scenarios without executor errors. These
are existing execution results, not tests executed by this documenter. They establish their declared
behavior scope rather than universal accessibility or visual fidelity.

The final artifact readback records Listing source
`1fae37a273fabe7a6c2d6c7ab628cb55d1b0d499404d3cae6c268a61e42fe4ae`, served web artifact
`339decf909fa03b9d18713294991163fcefc458127dd5766e1dd3d2c9334c033`, and image
`sha256:711a770bfdff456d14625e8c3c885c3cab725b68c8c457324dd6e4b7af700f7d`. Its separate local
artifact is `b53fde38e0265849c82537e22fa701e8cd18e71bbfccd329d7a9fd96d0a0564e`; this report does not
claim those artifacts are identical. The three individual served-asset entries record matching
served/built hashes. No artifact hash was recomputed here.

## Drift and limits not canonized or repaired

- Existing product context still describes the foundation phase and a frontend without router or
  data-fetching libraries; the inspected finished source imports React Router and TanStack Query.
  This report preserves that context rather than silently refreshing its product claims.
- Existing `DESIGN.md` navigation describes five phone destinations and a desktop Operations group;
  the public shell renders Places, Search and Ask. The sidecar already previews three tabs, but its
  Property row description and the Markdown still say Search is a later workflow. These are
  documentation scope/age differences, not new Listing design rules.
- The parent reports a pre-existing build-path configuration warning. Its exact original diagnostic
  text and configuration path were not supplied; no path, remedy or verification is invented here,
  and context was not rerun.
- `listing-detector.json` records exit 1 with no findings on accessible targets and three
  inaccessible inputs: `src/places/place-resources.ts`, `src/places/locale.tsx` and
  `src/routes/routes.tsx`. It is an incomplete detector result, not a clean gate, and was not rerun.
- The original hover-only timestamp route is not canonized as a component pattern; its native
  disclosure fix is supported by source and the bounded verdict. No defect was made legitimate by
  adding a token or prohibition to the incumbent system.
- Human screen-reader, daylight and zoom checks remain unexecuted according to the supplied handoff.
  This pass adds no live browser, computed-style, universal accessibility, persisted-storage,
  production-data or measured comp-reproduction claim.

The preservation boundary is satisfied: the incumbent product/design files and sidecar are retained,
the ordinary Listing extension is documented from finished source and captured evidence, and
existing drift remains explicitly disclosed.
