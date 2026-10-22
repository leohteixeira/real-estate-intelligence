Scenario: LISTING-001 Search → Property → Listing → Property → exact Search and history
  Given Applied safe filters/order
  When Follow native Property and explicit Listing entry, then return and use back/forward
  Then The exact Search URL and verified Property membership survive; Search stays current

Scenario: LISTING-002 Original events and permitted description versions
  Given Real prepared Listing 104 and returned Listing 109
  When Inspect original event metadata, price before/after and allowed versions
  Then Every fact agrees with parsed API; creation has no invented price; removal is not sale

Scenario: LISTING-003 Description rights and snapshot limitations
  Given Real supplementary Listing 991, 992 and 993
  When Open each in both locales, inspect descriptions, snapshot dates and null/zero fields
  Then Denied bodies/comparison are absent, expired evidence stays readable and retained counts/unknown expiry are honest

Scenario: LISTING-004 Identity and Listing read failures
  Given Malformed/v4, absent v7 and bounded HTTP/read faults
  When Open each and manually recover against the real API, then refetch stale cached Listing through browser history
  Then No invalid read, no private payload, no automatic retry; known detail survives and retry recovers

Scenario: LISTING-005 Independent Property context
  Given Ten-second stalled response, context failure and parsed wrong-membership response
  When Read Listing independently, then retry contextual Property
  Then Neutral ancestry/count until verified; Listing remains readable and only context retries

Scenario: LISTING-006 Six localized responsive surfaces
  Given Real Listing readbacks and local fonts
  When Inspect PT/EN at 390, 960 and 1440 with keyboard, geometry and full-page axe
  Then All visible controls ≥44px, focus works, no overflow or external/write request; immutable captures start at scroll zero

Scenario: LISTING-007 Authored Listing reference
  Given Unmodified 390×1782 Listing.dc.html
  When Serve fixed dev-only reference with local fonts
  Then Authored dimensions, source hash and independent reference capture remain reproducible