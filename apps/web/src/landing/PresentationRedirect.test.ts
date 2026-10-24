import { expect, it } from 'vitest';
import { presentationUrl } from './presentation-url';
it('keeps the old landing fragment when linking to the central presentation', () => {
  expect(presentationUrl()).toBe('https://leohteixeira.com/en/projects/real-estate-intelligence');
  expect(presentationUrl('#zone')).toBe(
    'https://leohteixeira.com/en/projects/real-estate-intelligence#zone',
  );
});
