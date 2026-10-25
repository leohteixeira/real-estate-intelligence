import { ASK_STATES } from '../../packages/contracts/dist/index.js';

export const accessibilityLocales = ['pt-BR', 'en'] as const;
export const accessibilityWidths = [390, 960, 1440] as const;

// Execution partitions are bounded containers, not additional semantic BDD scenarios.
export const accessibilityPartitions = [
  ...accessibilityLocales.flatMap((locale) =>
    accessibilityWidths.map((width) => `discovery-${locale}-${width}`),
  ),
  'search',
  'keyboard',
  ...accessibilityLocales.flatMap((locale) =>
    accessibilityWidths.map((width) => `details-${locale}-${width}`),
  ),
  'ask-pt-BR',
  'ask-en',
  ...accessibilityLocales.flatMap((locale) =>
    accessibilityWidths.map((width) => `recovery-${locale}-${width}`),
  ),
  ...accessibilityLocales.flatMap((locale) =>
    accessibilityWidths.flatMap((width) =>
      ['place', 'property', 'listing', 'privacy', 'search'].map(
        (screen) => `retained-${locale}-${screen}-${width}`,
      ),
    ),
  ),
  ...['variants', 'subreads', 'context'].flatMap((family) =>
    accessibilityLocales.flatMap((locale) =>
      accessibilityWidths.map((width) => `${family}-${locale}-${width}`),
    ),
  ),
  'adaptation-pt-BR',
  'adaptation-en',
] as const;

// An ordered execution contract, not additional semantic scenarios. The fixture and genuine
// transitions remain shared; a full default/open audit is the largest native test unit.
export function accessibilityExecutionSteps(partition: string): string[] | undefined {
  for (const locale of accessibilityLocales) {
    if (partition === `adaptation-${locale}`)
      return accessibilityScreens.flatMap((screen) =>
        ['reflow', 'zoom'].flatMap((mode) => {
          const suffix = `${mode}-${locale}-${mode === 'reflow' ? 320 : 720}`;
          return [
            `${screen.id}-${suffix}`,
            ...(screen.id === 'ask' ? ASK_STATES.map((state) => `ask-${state}-${suffix}`) : []),
          ];
        }),
      );
    for (const width of accessibilityWidths) {
      const suffix = `${locale}-${width}`;
      for (const screen of ['place', 'property', 'listing', 'privacy', 'search'])
        if (partition === `retained-${locale}-${screen}-${width}`)
          return screen === 'search'
            ? ['loading', 'refused', 'malformed', 'recovered'].map(
                (state) => `search-retained-cursor-${state}-${suffix}`,
              )
            : ['refresh', 'error', 'malformed', 'recovered'].map(
                (state) => `${screen}-retained-${state}-${suffix}`,
              );
      if (partition === `variants-${suffix}`)
        return [
          ...[4, 901, 902, 903].map((id) => `property-${id}-${suffix}`),
          ...[104, 109, 991, 992, 993].map((id) => `listing-${id}-${suffix}`),
          ...['properties', 'listings'].flatMap((family) => [
            ...['invalid-id', '0199a3e0-0000-4000-8000-000000000001'].map(
              (id) => `${family}-invalid-${id}-${suffix}`,
            ),
            `${family}-404-${suffix}`,
          ]),
          ...['places', 'search', 'ask'].flatMap((family) => [
            `${family}-invalid-place-${suffix}`,
            `${family}-404-${suffix}`,
          ]),
        ];
      if (partition === `subreads-${suffix}`)
        return ['place-detail', 'place-series', 'place-neighbours', 'place-reductions'].flatMap(
          (read) =>
            ['loading', 'refused', 'malformed', 'recovered'].map(
              (state) => `${read}-${state}-${suffix}`,
            ),
        );
      if (partition === `context-${suffix}`)
        return [
          ...['places', 'children'].flatMap((endpoint) => [
            ...['loading', 'refused', 'malformed', 'recovered'].map(
              (state) => `hierarchy-${endpoint}-${state}-${suffix}`,
            ),
            ...(width === 390 ? [`hierarchy-${endpoint}-shell-recovered-${suffix}`] : []),
          ]),
          ...['default', 'open'].flatMap((disclosure) =>
            ['loading', 'timeout', 'refused', 'malformed', 'recovered'].map(
              (state) => `listing-context-${state}-${disclosure}-${suffix}`,
            ),
          ),
        ];
    }
  }
  return undefined;
}

export const accessibilityStateMapping = [
  {
    partition: 'discovery-{locale}-{width}',
    scenario: 'A11Y-001',
    states:
      'Place normal/default and every nested disclosure open; owned root redirect and local entry contracts; six locale/layout variants',
  },
  {
    partition: 'search',
    scenario: 'A11Y-001',
    states: 'Search normal/default/open and Filters normal; six variants',
  },
  {
    partition: 'keyboard',
    scenario: 'A11Y-002',
    states:
      'Native keyboard skip, draft/apply/cancel/clear/history/chip removal and next Tab; six variants',
  },
  {
    partition: 'details-{locale}-{width}',
    scenario: 'A11Y-001/A11Y-002',
    states:
      'Property 1 and its real Listing normal/default/open; Privacy; deep source anchors; six variants',
  },
  {
    partition: 'ask-{locale}',
    scenario: 'A11Y-004',
    states:
      'Seven genuine catalogue/run/thread snapshots default/open, local private operands and recorded interrupted SSE continuation; three widths',
  },
  {
    partition: 'recovery-{locale}-{width}',
    scenario: 'A11Y-003',
    states:
      'Search empty/invalid, Filters invalid range; seven families held initial read, 503, truncated bytes and explicit native retry recovery, default/open where available',
  },
  {
    partition: 'retained-{locale}-{screen}-{width}',
    scenario: 'A11Y-003',
    states:
      'Place market, Property, Listing and Privacy retained refresh after genuine 30-second cache ageing: held/503/truncated/recovered, default/open; Search next cursor page retains exact first-page identities/order/count during held/503/truncated/recovered',
  },
  {
    partition: 'variants-{locale}-{width}',
    scenario: 'A11Y-001/A11Y-003',
    states:
      'Existing synthetic Property 4/901/902/903 (inactive/returned/expired/missing metadata), Listing 104/109/991/992/993 (removed/returned/expired/missing evidence), default/open; real 404 and syntactically invalid/version-4 IDs without fabricated recovery',
  },
  {
    partition: 'subreads-{locale}-{width}',
    scenario: 'A11Y-003',
    states:
      'Independent Place detail, monthly series, neighbours and reductions: held/503/truncated/recovered, default/open',
  },
  {
    partition: 'context-{locale}-{width}',
    scenario: 'A11Y-003',
    states:
      'Root and child hierarchy failures/recovery in Filters and shell; independent Listing property-context genuine deadline/loading default/open, timeout/503/truncated/recovered default/open without refetching Listing',
  },
  {
    partition: 'adaptation-{locale}',
    scenario: 'A11Y-005',
    states:
      'All seven operational families at 320 CSS px and independently measured native browser 200%; applicable open evidence and seven Ask states',
  },
  {
    partition: 'every partition',
    scenario: 'A11Y-006',
    states:
      'Whole source/executor/config/runtime/served bytes; SQL and network readback on success and failure; owned cleanup and foreign preservation; setup alone is pilot, not acceptance',
  },
] as const;
export const accessibilityScreens = [
  {
    id: 'place',
    path: '/places/sao-paulo-bela-vista',
    ready: '.place-key-figures',
    oracle: 'parsePlaceResponse + parsePlaceMarketResponse actual HTTP',
    disclosures: true,
  },
  {
    id: 'search',
    path: '/search/sao-paulo-bela-vista',
    ready: '.search-rows li',
    oracle: 'parseSearchResponse actual HTTP and exact row identifiers',
    disclosures: true,
  },
  {
    id: 'filters',
    path: '/search/sao-paulo-bela-vista?view=filters',
    ready: '#filter-place',
    oracle: 'Actual hierarchy + preview count, local draft only',
    disclosures: false,
  },
  {
    id: 'property',
    path: '/properties/0199a3e0-0000-7000-8000-000000000001',
    ready: '.property-basis',
    oracle: 'parsePropertyResponse actual HTTP',
    disclosures: true,
  },
  {
    id: 'listing',
    path: '',
    ready: '.listing-values',
    oracle: 'parseListingResponse actual HTTP, property membership',
    disclosures: true,
  },
  {
    id: 'ask',
    path: '/ask/sao-paulo-bela-vista',
    ready: '#ask-draft',
    oracle: 'parseAskAvailability + seven catalogue/run/thread/SSE actual HTTP',
    disclosures: true,
  },
  {
    id: 'privacy',
    path: '/privacy',
    ready: '.privacy-source',
    oracle: 'parseEnabledSourcesResponse actual HTTP',
    disclosures: false,
  },
] as const;

// The redirect is observed as an owned HTTP response; its destination is never requested.
export const accessibilityEntryContract = {
  root: {
    path: '/',
    status: 308,
    location: 'https://leohteixeira.com/en/projects/real-estate-intelligence',
    followRedirects: false,
  },
  entries: [
    { path: '/places', destination: '/places/sao-paulo-bela-vista', ready: '.place-key-figures' },
    { path: '/privacy', destination: '/privacy', ready: '.privacy-source' },
    { path: '/ask', destination: '/ask/sao-paulo-bela-vista', ready: '#ask-draft' },
    { path: '/search', destination: '/search/sao-paulo-bela-vista', ready: '.search-rows li' },
  ],
} as const;

export const accessibilityBoundaries = [
  {
    capability: 'Externally owned portfolio presentation',
    production:
      'Exact root HTTP 308 transfers presentation ownership to the independent portfolio; seven operational screen families remain local',
    evidence:
      'Owned Nginx redirect and local entry response/navigation receipts only; external appearance, accessibility, privacy, motion and no-WebGL assessment remain outstanding in the portfolio repository',
    status: 'externally-owned-obligation',
  },
  {
    capability: 'Market freshness branches',
    production: 'Prepared MVP overview is untracked; no tracked freshness fabricated',
    evidence: 'Existing system-state gallery and SystemStates.test.tsx',
    status: 'component-only',
  },
  {
    capability: 'Quota, live confirmation/cancellation/model/source branches',
    production:
      'Public prepared Ask has commandHandlers=false; local edits never become persisted confirmation',
    evidence: 'Existing state gallery, Ask component/parser tests',
    status: 'unavailable-in-public-MVP',
  },
  {
    capability: 'Licensed and not-verified enabled source branches',
    production: 'Source-register admission forbids synthetic examples; no real source enabled',
    evidence: 'PrivacyNotice.test.tsx and enabled-source.dto.test.ts',
    status: 'component-only',
  },
  {
    capability: 'Protected/V2 routes',
    production: 'Outside delivered anonymous MVP',
    evidence: 'Explicit plan exclusion',
    status: 'excluded',
  },
  {
    capability: 'Assistive technology pronunciation, physical touch/daylight',
    production: 'Chromium semantic/keyboard/contrast evidence cannot assess human perception',
    evidence: 'Human assessment remains outstanding',
    status: 'human-limit',
  },
] as const;

export const accessibilityScenarios = [
  {
    id: 'A11Y-001',
    title: 'Every public screen and evidence disclosure',
    given:
      'Seven operational screen families, independent parsed actual HTTP oracles and owned production bytes',
    when: 'Read each screen/default and open evidence with full axe and genuine forward/reverse Tab at both locales and 390/960/1440',
    then: 'Exact data, no axe violations, every enabled control reachable and visible; six layouts remain variants',
  },
  {
    id: 'A11Y-002',
    title: 'Keyboard entry, routes, filters and document anchors',
    given: 'A keyboard-only anonymous visitor',
    when: 'Skip repetition, change routes, open/close/apply/clear filters and activate evidence anchors/history',
    then: 'Logical focus and URL context survive without a modal trap or background focus theft',
  },
  {
    id: 'A11Y-003',
    title: 'Genuine empty, invalid and interrupted reads',
    given: 'Actual empty intersection and real admitted bytes',
    when: 'Enter invalid query/range, hold/refuse/corrupt reads then explicitly recover',
    then: 'Associated error/loading states and keyboard recovery retain authority and readable evidence',
  },
  {
    id: 'A11Y-004',
    title: 'Seven Ask snapshots and private local operands',
    given: 'Real public catalogue, run/thread and recorded SSE continuation',
    when: 'Select seven prepared snapshots and edit local confirmation then explicitly read continuation',
    then: 'State/result match real oracle, unsent edits stay private, interrupted stream never becomes completion',
  },
  {
    id: 'A11Y-005',
    title: 'Operational reflow and native enlargement',
    given:
      'Every local operational screen in PT and EN; presentation assessment remains externally owned',
    when: 'Read at 320 CSS px and native browser 200%',
    then: 'No document overflow or lost controls; external motion and no-WebGL obligations remain outstanding',
  },
  {
    id: 'A11Y-006',
    title: 'Source, runtime and read-only boundaries',
    given: 'Whole-MVP source inventory, image/served bytes and SQL baseline',
    when: 'Compare end state and cleanup ownership',
    then: 'Exact immutable evidence, no writes/external requests/SQL changes and owned cleanup preserves foreign resources',
  },
] as const;
