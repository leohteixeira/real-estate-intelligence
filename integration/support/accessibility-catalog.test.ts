import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import {
  accessibilityBoundaries,
  accessibilityEntryContract,
  accessibilityLocales,
  accessibilityPartitions,
  accessibilityScenarios,
  accessibilityScreens,
  accessibilityStateMapping,
  accessibilityWidths,
  accessibilityExecutionSteps,
} from './accessibility-catalog.ts';
import { ASK_STATES } from '../../packages/contracts/dist/index.js';

test('native execution budgets cover each pending journey state in order without duplicating scenarios', () => {
  for (const locale of accessibilityLocales) {
    for (const width of accessibilityWidths) {
      const suffix = `${locale}-${width}`;
      expect(accessibilityExecutionSteps(`retained-${locale}-place-${width}`)).toEqual(
        ['refresh', 'error', 'malformed', 'recovered'].map(
          (state) => `place-retained-${state}-${suffix}`,
        ),
      );
      expect(accessibilityExecutionSteps(`retained-${locale}-search-${width}`)).toEqual(
        ['loading', 'refused', 'malformed', 'recovered'].map(
          (state) => `search-retained-cursor-${state}-${suffix}`,
        ),
      );
      const variants = accessibilityExecutionSteps(`variants-${suffix}`)!;
      expect(variants).toHaveLength(21);
      expect(variants).toContain(`property-903-${suffix}`);
      expect(variants).toContain(`listing-993-${suffix}`);
      expect(variants).toContain(
        `properties-invalid-0199a3e0-0000-4000-8000-000000000001-${suffix}`,
      );
      expect(variants).toContain(`ask-404-${suffix}`);
      const subreads = accessibilityExecutionSteps(`subreads-${suffix}`)!;
      expect(subreads).toHaveLength(16);
      for (const read of ['place-detail', 'place-series', 'place-neighbours', 'place-reductions'])
        expect(subreads.filter((state) => state.startsWith(`${read}-`))).toHaveLength(4);
      const context = accessibilityExecutionSteps(`context-${suffix}`)!;
      expect(context).toHaveLength(width === 390 ? 20 : 18);
      expect(context).toContain(`listing-context-loading-default-${suffix}`);
      expect(context).toContain(`listing-context-loading-open-${suffix}`);
      expect(context).toContain(`listing-context-recovered-open-${suffix}`);
      expect(context.includes(`hierarchy-children-shell-recovered-${suffix}`)).toBe(width === 390);
    }
    const adaptation = accessibilityExecutionSteps(`adaptation-${locale}`)!;
    expect(adaptation).toHaveLength(28);
    for (const screen of accessibilityScreens)
      for (const [mode, width] of [
        ['reflow', 320],
        ['zoom', 720],
      ])
        expect(adaptation).toContain(`${screen.id}-${mode}-${locale}-${width}`);
    for (const state of ASK_STATES)
      for (const [mode, width] of [
        ['reflow', 320],
        ['zoom', 720],
      ])
        expect(adaptation).toContain(`ask-${state}-${mode}-${locale}-${width}`);
  }
  for (const partition of accessibilityPartitions) {
    const steps = accessibilityExecutionSteps(partition);
    if (steps) expect(new Set(steps).size).toBe(steps.length);
  }
  expect(accessibilityExecutionSteps('discovery-pt-BR-390')).toBeUndefined();
  expect(accessibilityScenarios).toHaveLength(6);
});

test('Discovery retains every locale and width once in bounded production partitions', () => {
  const discovery = accessibilityPartitions.filter((partition) =>
    partition.startsWith('discovery-'),
  );
  expect(discovery).toEqual([
    'discovery-pt-BR-390',
    'discovery-pt-BR-960',
    'discovery-pt-BR-1440',
    'discovery-en-390',
    'discovery-en-960',
    'discovery-en-1440',
  ]);
  expect(new Set(accessibilityPartitions).size).toBe(72);
  expect(accessibilityPartitions).toHaveLength(72);
  expect(accessibilityScenarios).toHaveLength(6);
  for (const locale of accessibilityLocales)
    for (const width of accessibilityWidths)
      expect(
        discovery.filter((partition) => partition === `discovery-${locale}-${width}`),
      ).toHaveLength(1);
});

test('retained reads preserve every screen and locale/layout in independently bounded partitions', () => {
  const retained = accessibilityPartitions.filter((partition) => partition.startsWith('retained-'));
  expect(retained).toHaveLength(30);
  for (const locale of accessibilityLocales)
    for (const width of accessibilityWidths)
      expect(
        retained.filter(
          (partition) =>
            partition.startsWith(`retained-${locale}-`) && partition.endsWith(`-${width}`),
        ),
      ).toEqual(
        ['place', 'property', 'listing', 'privacy', 'search'].map(
          (screen) => `retained-${locale}-${screen}-${width}`,
        ),
      );
  const mapping = accessibilityStateMapping.find((entry) =>
    entry.partition.startsWith('retained-'),
  );
  expect(mapping?.partition).toBe('retained-{locale}-{screen}-{width}');
  expect(mapping?.states).toContain('held/503/truncated/recovered');
  expect(mapping?.states).toContain(
    'Search next cursor page retains exact first-page identities/order/count',
  );
});

test('bounded details partitions preserve every locale/width and both detail journeys', () => {
  expect(accessibilityPartitions.filter((partition) => partition.startsWith('details-'))).toEqual([
    'details-pt-BR-390',
    'details-pt-BR-960',
    'details-pt-BR-1440',
    'details-en-390',
    'details-en-960',
    'details-en-1440',
  ]);
  const mapping = accessibilityStateMapping.find((entry) => entry.partition.startsWith('details'));
  expect(mapping?.partition).toBe('details-{locale}-{width}');
  expect(mapping?.states).toContain('Property 1 and its real Listing normal/default/open');
  expect(mapping?.states).toContain('Privacy; deep source anchors; six variants');
});

test('the catalog covers seven operational families and preserves externally owned presentation obligations', async () => {
  expect(accessibilityScreens.map((screen) => screen.id)).toEqual([
    'place',
    'search',
    'filters',
    'property',
    'listing',
    'ask',
    'privacy',
  ]);
  expect(accessibilityScreens.some((screen) => String(screen.path) === '/')).toBe(false);
  expect(accessibilityEntryContract.root).toEqual({
    path: '/',
    status: 308,
    location: 'https://leohteixeira.com/en/projects/real-estate-intelligence',
    followRedirects: false,
  });
  expect(accessibilityEntryContract.entries.map((entry) => entry.path)).toEqual([
    '/places',
    '/privacy',
    '/ask',
    '/search',
  ]);
  const nginx = await readFile(new URL('../../docker/web-nginx.conf', import.meta.url), 'utf8');
  const rootHandler = /location\s*=\s*\/\s*\{([^}]+)\}/.exec(nginx)?.[1]?.trim();
  expect(rootHandler).toBe(
    `return ${accessibilityEntryContract.root.status} ${accessibilityEntryContract.root.location};`,
  );
  expect(accessibilityBoundaries).toContainEqual({
    capability: 'Externally owned portfolio presentation',
    production:
      'Exact root HTTP 308 transfers presentation ownership to the independent portfolio; seven operational screen families remain local',
    evidence:
      'Owned Nginx redirect and local entry response/navigation receipts only; external appearance, accessibility, privacy, motion and no-WebGL assessment remain outstanding in the portfolio repository',
    status: 'externally-owned-obligation',
  });
  const discovery = accessibilityStateMapping.find((entry) =>
    entry.partition.startsWith('discovery-'),
  );
  expect(discovery?.states).toContain('Place normal/default and every nested disclosure open');
  expect(discovery?.states).toContain('owned root redirect and local entry contracts');
  expect(
    accessibilityStateMapping.find((entry) => entry.partition === 'adaptation-{locale}')?.states,
  ).toContain('All seven operational families');
  expect(accessibilityScenarios.find((scenario) => scenario.id === 'A11Y-005')?.then).toContain(
    'external motion and no-WebGL obligations remain outstanding',
  );
});
