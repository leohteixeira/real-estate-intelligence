import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from 'playwright';
import { expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';

/** Full-page WCAG 2/2.1/2.2 A/AA analysis. No rule or region exclusions. */
export async function checkAccessibility(page: Page, evidenceName: string) {
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const directory = new URL('../../apps/web/.impeccable/review/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL(`${evidenceName}-accessibility.json`, directory),
    JSON.stringify(
      {
        url: page.url(),
        engine: results.testEngine,
        environment: results.testEnvironment,
        violations: results.violations,
        incomplete: results.incomplete,
        passes: results.passes.map((rule) => rule.id),
        manual: [
          'Screen reader reading order and pronunciation',
          'Focus visibility under ambient daylight',
          'Zoom/reflow and all future interaction states',
          'Comprehension of canonical names and evidence',
        ],
      },
      null,
      2,
    ),
  );
  expect(
    results.violations,
    JSON.stringify(
      results.violations.map((rule) => ({
        id: rule.id,
        impact: rule.impact,
        help: rule.help,
        helpUrl: rule.helpUrl,
        nodes: rule.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
      })),
      null,
      2,
    ),
  ).toEqual([]);
  return { incomplete: results.incomplete };
}
