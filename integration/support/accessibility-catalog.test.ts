import { expect, test } from 'vitest';
import {
  accessibilityLocales,
  accessibilityPartitions,
  accessibilityScenarios,
  accessibilityWidths,
} from './accessibility-catalog.ts';

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
  expect(new Set(accessibilityPartitions).size).toBe(43);
  expect(accessibilityPartitions).toHaveLength(43);
  expect(accessibilityScenarios).toHaveLength(6);
  for (const locale of accessibilityLocales)
    for (const width of accessibilityWidths)
      expect(
        discovery.filter((partition) => partition === `discovery-${locale}-${width}`),
      ).toHaveLength(1);
});
