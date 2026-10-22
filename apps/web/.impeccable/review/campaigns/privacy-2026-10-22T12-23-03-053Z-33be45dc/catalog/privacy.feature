Feature: Public privacy notice

  Scenario: PRIVACY-001 Document and responsive accessibility
    Given An anonymous visitor and the actual enabled synthetic source
    When Read directly, reload and keyboard navigate all sections at 390/960/1440 in both locales
    Then Nine sections, exact source attribution and permissions, title/lang, no place context, axe, fonts and targets pass

  Scenario: PRIVACY-002 Public entry and history
    Given Every public screen with the shared selected locale
    When Follow the visible privacy footer then navigate back and forward on phone and desktop
    Then Landing, Places, Search, Property, Listing and Ask all reach the document and retain locale

  Scenario: PRIVACY-003 Read failure and recovery
    Given Actual admitted source and empty response bytes
    When Refuse, corrupt, hold and cancel source reads then explicitly retry
    Then Static policy survives sanitized bounded errors, manual retry recovers and obsolete requests cannot replace current evidence

  Scenario: PRIVACY-004 Publication configuration
    Given Absent public values then an explicitly synthetic configured production build
    When Read controller/contact before and after rebuilding the owned web image
    Then Absent means unavailable with no mailto; safe configured text/mailto appears with the real-processing restriction

  Scenario: PRIVACY-005 Incumbent reference evidence
    Given Unmodified Components, Main and DesktopPlace references
    When Capture their authored dimensions on an owned Vite server
    Then Reference bytes/dependencies and capture hashes are recorded without creating a Privacy artboard

  Scenario: PRIVACY-006 Read-only and cleanup boundaries
    Given Owned stack, SQL baseline and runtime asset hashes
    When Compare served assets, final database inventory and network observations
    Then No writes, external origins or SQL changes; owned resources removed and foreign resources preserved
