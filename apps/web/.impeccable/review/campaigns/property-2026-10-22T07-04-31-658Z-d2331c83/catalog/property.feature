Scenario: PROPERTY-001 Complete three-listing evidence
  Given A prepared Bela Vista property with three source listings, nine reasons and two dated reductions.
  When Open the actual Property detail from filtered Search.
  Then Every price, source, event, interval, reason and feature is consistent with the parsed real API, and no Sale or unavailable image is fabricated.

Scenario: PROPERTY-002 Exact Search return and draft-only Ask
  Given An applied internal Search URL with explicit false and ordering.
  When Open its native Property row, return, then follow Ask from detail.
  Then The exact Search URL survives and Ask receives a labelled escaped unexecuted draft only in state; no mutation or question URL/storage occurs.

Scenario: PROPERTY-003 Actual neighborhood and removed return gap
  Given The prepared Vila Mariana property with a Cobalto removed/reappeared interval.
  When Open detail directly and disclose source chronology.
  Then Shell links use Vila Mariana, Search is current, all bars/ticks/labels share a date scale, and the April–June gap is dashed without a sold inference.

Scenario: PROPERTY-004 Permission, expiry and no-active boundaries
  Given Prepared supplementary properties 901, 902 and 903.
  When Read descriptions, safe metadata and retained removed history.
  Then Denied text is absent; expired hashes/dates remain accessible; null Asking/rooms remain unknown and zero active does not erase history.

Scenario: PROPERTY-005 Identity and safe manual failure recovery
  Given Malformed/v4 identities, an absent v7 identity, and a bounded injected HTTP failure.
  When Open each state, manually retry the real detail, then return through history with a stale cache and a bounded refetch fault.
  Then Invalid identities cause no detail read, unknown context stays neutral, 404/errors expose no private body, known detail survives refetch failure, and manual retry reaches the real API without automatic retry.

Scenario: PROPERTY-006 Both locales and all responsive breakpoints
  Given The complete Property detail and local Placa fonts.
  When Render PT/EN at 390, 960 and 1440, keyboard-toggle evidence, inspect target geometry and scan the full page.
  Then No external/write request or horizontal overflow occurs, every visible control is at least 44px in both dimensions, visible keyboard focus works, and full-page axe reports no violations.

Scenario: PROPERTY-007 Authored references remain reproducible
  Given The existing Property and DesktopProperty artboards, not altered by implementation.
  When Render the dev-only fixed reference entries at 390×1842 and 1440×1207.
  Then Both authored reference captures use local fonts, preserve authored dimensions and are source-hashed for the parent’s separate visual comparison.