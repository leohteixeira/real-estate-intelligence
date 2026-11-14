import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
/** The body of the first `@media (max-width: 959px)` block that styles the phone tab bar. */
function phoneRules(css: string): string {
  const start = css.indexOf('@media (max-width: 959px)');
  const end = css.indexOf('\n}\n', start);
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, end);
}

it('keeps the phone tab bar fixed to the viewport bottom and reserves its space', () => {
  const rules = phoneRules(read('../styles/place.css'));
  const bar = /\.public-tabs \{([^}]*)\}/.exec(rules)?.[1] ?? '';
  expect(bar).toContain('position: fixed;');
  expect(bar).toContain('inset: auto 0 0;');
  expect(bar).toContain('env(safe-area-inset-bottom)');
  const reserve = 'calc(69px + env(safe-area-inset-bottom))';
  expect(/\.place-main \{([^}]*)\}/.exec(rules)?.[1]).toContain(`padding-bottom: ${reserve};`);
  expect(/html:has\(\.public-tabs\)[^{]*\{([^}]*)\}/.exec(rules)?.[1]).toContain(
    `scroll-padding-bottom: ${reserve};`,
  );
});
it('matches the reserved height to the bar metrics and exposes the safe-area insets', () => {
  const bar = /\n\.tabbar \{([^}]*)\}/.exec(read('../styles/components.css'))?.[1] ?? '';
  const link = /\n\.tabbar a \{([^}]*)\}/.exec(read('../styles/components.css'))?.[1] ?? '';
  expect(bar).toContain('border-top: 1px solid');
  expect(bar).toContain('padding: 6px 4px 10px;');
  expect(link).toContain('min-height: 52px;');
  expect(read('../../index.html')).toContain('viewport-fit=cover');
});
