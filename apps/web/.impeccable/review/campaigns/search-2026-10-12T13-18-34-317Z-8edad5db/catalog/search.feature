Scenario: SEARCH-001 Prepared scope and all filters remain server-owned
  Given An isolated prepared city with five synthetic properties and median 951220 minor units per m².
  When Apply each published filter independently through the Filters editor.
  Then URL minor units and actual rows/count/median match the public API; identical and zero outcomes remain truthful.

Scenario: SEARCH-002 Every ordering and cursor page comes from the server
  Given The five prepared city properties.
  When Select each of four orderings and load a smaller cursor page.
  Then Server order and full-result median are retained while pages append and input changes reset the cursor.

Scenario: SEARCH-003 Draft cancellation, clear, apply and browser history
  Given An applied explicit-false query.
  When Edit and cancel, clear within the editor, then apply and traverse history.
  Then Draft changes do not mutate the applied URL and false remains a genuine constraint.

Scenario: SEARCH-004 Exact localized amounts and safe malformed input
  Given PT and EN locales with a city draft.
  When Enter locale money and decimal area, then inverted ranges and an unknown deep-link key.
  Then Exact minor units are sent only for valid inputs; invalid requests are not forwarded and genuine clear recovery is available.

Scenario: SEARCH-005 Proven empty attribution and real ancestor recovery
  Given Reduced has three city results, returned has one, and their intersection is empty.
  When Apply both flags, relax the attributed group and widen the original empty search.
  Then Returned excludes the last three, relaxing returns three and widening retains filters on the actual state ancestor.

Scenario: SEARCH-006 Registered hierarchy and neutral zero-property scope
  Given The complete registered place hierarchy includes zero-property street blocks.
  When Choose an unfiltered zero-property block from the editor.
  Then It is reachable and shows a neutral empty result without invented responsible filters.

Scenario: SEARCH-007 Independent read failures recover through manual retry
  Given A valid city search and editor.
  When Inject bounded transport failures for result, preview and diagnostic reads, then retry manually.
  Then Place context and draft survive, no false zero/count is displayed and genuine responses recover.

Scenario: SEARCH-008 Pinned surfaces in both locales and three viewports
  Given Bela Vista and city Search/Filters with local fonts.
  When Render PT and EN at 390, 960 and 1440, walk native controls and disclose evidence.
  Then No horizontal overflow or external request occurs; every control is at least 44px, keyboard works and full-page axe reports no violations.