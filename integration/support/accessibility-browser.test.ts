import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, vi } from 'vitest';
import { preserveCleanup } from './cleanup.ts';
import { settlePropertyCaptureStart } from './property-capture.ts';
import {
  assessContrast,
  measureAccessibility,
  publicLocaleControlSelector,
  publicPrivacyEntrySelector,
  prepareAccessibilityHierarchy,
  walkKeyboard,
} from './accessibility-browser.ts';

test('hierarchy preparation waits for the full serial read rather than the recovered root response', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      await page.setContent(
        '<nav class="place-navigation"></nav><label for="filter-place">Place</label><select id="filter-place"><option value="current">Current place</option></select>',
      );
      await prepareAccessibilityHierarchy(page, { navigation: [], filters: ['current'] });
      // This is an isolated DOM lifecycle fixture, not a fabricated business response.
      // Root recovery removes the error before its serial child reads publish either list.
      await page.evaluate(() => {
        setTimeout(() => {
          document.querySelector('.place-navigation')!.innerHTML =
            '<a href="/search/first">First</a><a href="/search/last">Last</a>';
          document.querySelector('#filter-place')!.innerHTML =
            '<option value="root">Root</option><option value="current">Current place</option><option value="last">Last</option>';
        }, 1500);
      });
      await prepareAccessibilityHierarchy(page, {
        navigation: ['first', 'last'],
        filters: ['root', 'current', 'last'],
      });
      expect(await page.locator('.place-navigation a').count()).toBe(2);
      expect(await page.locator('#filter-place option').count()).toBe(3);
      await page.evaluate(() => {
        document.querySelector('#filter-place')!.innerHTML =
          '<option value="current">Current place</option>';
        setTimeout(() => {
          document.querySelector('#filter-place')!.innerHTML =
            '<option value="root">Root</option><option value="current">Current place</option><option value="last">Last</option>';
        }, 1500);
      });
      await prepareAccessibilityHierarchy(page, {
        navigation: ['first', 'last'],
        filters: ['root', 'current', 'last'],
      });
      await expect(
        prepareAccessibilityHierarchy(page, { navigation: ['last', 'first'] }),
      ).rejects.toThrow('deeply equal');
      await expect(
        prepareAccessibilityHierarchy(page, { filters: ['current', 'root', 'last'] }),
      ).rejects.toThrow('deeply equal');
    },
    () => browser.close(),
  );
});

test('locale preparation and privacy entry select one genuinely visible responsive shell control', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage();
      const css = (
        await Promise.all(
          ['tokens', 'components', 'place', 'property', 'listing'].map((file) =>
            readFile(new URL(`../../apps/web/src/styles/${file}.css`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      const languages =
        '<div class="lang"><button lang="pt-BR">PT</button><button lang="en">EN</button></div>';
      const privacy = '<a href="/privacy">Privacy</a>';
      for (const shell of ['ordinary', 'property', 'listing'] as const) {
        await page.setContent(
          `<style>${css}</style><div class="rei place-app${shell !== 'ordinary' ? ' property-app' : ''}${shell === 'listing' ? ' listing-app' : ''}"><aside class="rail place-rail">${languages}${privacy}</aside><div class="main place-main"><header class="shell place-top">${languages}</header><main class="${shell === 'listing' ? 'property-details listing-details' : ''}">${shell === 'listing' ? `<div class="property-return">${languages}</div>` : ''}Public content</main><footer class="public-footer">${languages}${privacy}</footer></div></div>`,
        );
        for (const width of [320, 390, 720, 960, 1440]) {
          await page.setViewportSize({ width, height: 1142 });
          for (const locale of ['pt-BR', 'en'] as const) {
            const entry = page
              .locator(publicLocaleControlSelector(locale))
              .filter({ visible: true });
            expect(await entry.count(), `${shell}: ${locale} at ${width}`).toBe(1);
            expect(
              await entry.evaluate(
                (element) => element.closest('aside,header,.property-return')?.className,
              ),
            ).toBe(
              width >= 960
                ? 'rail place-rail'
                : shell === 'listing'
                  ? 'property-return'
                  : 'shell place-top',
            );
          }
          expect(
            await page.locator(publicPrivacyEntrySelector).filter({ visible: true }).count(),
          ).toBe(1);
          expect(await page.locator('.public-footer').isVisible()).toBe(width < 960);
        }
      }
      await page.setContent(`<div class="lp-lang">${languages}</div>`);
      for (const locale of ['pt-BR', 'en'] as const)
        expect(
          await page.locator(publicLocaleControlSelector(locale)).filter({ visible: true }).count(),
        ).toBe(1);
    },
    () => browser.close(),
  );
});

test('native keyboard receipts preserve programmatic-only exclusion and expose clipped focus without repair', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
      await page.setContent(
        '<style>button:focus-visible{outline:3px solid blue;outline-offset:2px}.clip{overflow:hidden;width:max-content}.enclosing{border:1px solid transparent}.enclosing:focus-within{border-color:blue;box-shadow:0 0 0 3px #eee}input:focus-visible{outline:0}</style><a href="#content">Skip</a><div class="clip"><button>Clipped</button></div><button tabindex="-1">Programmatic only</button><div class="enclosing"><input aria-label="Inherited"></div><details><summary>Outer evidence</summary><a href="#hidden">Closed source</a><details><summary>Nested evidence</summary><a href="#nested">Nested source</a></details></details><main id="content" tabindex="-1">Content</main>',
      );
      const receipt = await walkKeyboard(page);
      expect(receipt.expected.map((entry) => entry.name)).toEqual([
        'Skip',
        'Clipped',
        'Inherited',
        'Outer evidence',
      ]);
      expect(receipt.inventoryChanged).toBe(false);
      expect(receipt.directions.map((direction) => direction.missing)).toEqual([[], []]);
      expect(
        receipt.directions[0]!.steps.find((step) => step.name === 'Clipped')!.clippedBy,
      ).toEqual(['clip']);
      expect(receipt.directions[1]!.steps.every((step) => step.focusVisible)).toBe(true);
      const inherited = receipt.directions[0]!.steps.find((step) => step.name === 'Inherited')!;
      expect(inherited.indicator).toBe(true);
      expect(inherited.focusContrast.foreground).toBe('rgb(0, 0, 255)');
      expect(inherited.focusContrast.indicator).toContain('painted enclosing');
      expect(assessContrast(inherited.focusContrast, 3).ratio).toBeGreaterThan(3);
      expect((await measureAccessibility(page)).overflow).toBe(false);
    },
    () => browser.close(),
  );
});

test('native focus measurements follow one unmodified rendered capture and retain real obstructions', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({ viewport: { width: 960, height: 1142 } });
      const css = (
        await Promise.all(
          ['tokens', 'components', 'place'].map((file) =>
            readFile(new URL(`../../apps/web/src/styles/${file}.css`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      await page.setContent(
        `<style>${css}.obstruction{position:fixed;inset:0;z-index:1000;pointer-events:auto}</style><div class="rei place-app"><a class="public-skip" href="#content">Skip</a><aside class="rail place-rail"><a class="brand" href="#content">Real Estate<br>Intelligence</a></aside><main id="content" tabindex="-1"><button>Obscured</button></main><div class="obstruction" aria-hidden="true"></div></div>`,
      );
      const capture = vi.spyOn(page, 'screenshot');
      const measurement = vi.spyOn(page, 'evaluate');
      const receipt = await walkKeyboard(page);
      const observations = receipt.directions.reduce(
        (total, direction) =>
          total + direction.steps.length + direction.browserChromeTransitions.length + 1,
        0,
      );
      // The final repeated control ends each direction after its rendered observation.
      expect(capture).toHaveBeenCalledTimes(observations);
      expect(measurement).toHaveBeenCalledTimes(observations);
      for (let index = 0; index < observations; index++) {
        expect(capture.mock.invocationCallOrder[index]).toBeLessThan(
          measurement.mock.invocationCallOrder[index]!,
        );
        if (index + 1 < observations)
          expect(measurement.mock.invocationCallOrder[index]).toBeLessThan(
            capture.mock.invocationCallOrder[index + 1]!,
          );
      }
      for (const [options] of capture.mock.calls)
        expect(options).toEqual({
          clip: { x: 0, y: 0, width: 1, height: 1 },
          caret: 'initial',
          animations: 'allow',
        });
      for (const direction of receipt.directions) {
        expect(direction.missing).toEqual([]);
        const obscured = direction.steps.find((step) => step.name === 'Obscured')!;
        expect(obscured.focused && obscured.focusVisible).toBe(true);
        expect(obscured.unobscured).toBe(false);
        expect(obscured.hit?.className).toBe('obstruction');
        const brand = direction.steps.find((step) => step.name === 'Real EstateIntelligence')!;
        expect(brand.outline.offset).toBe('2px');
        expect(brand.outline.color).toBe('rgb(242, 183, 5)');
      }
    },
    () => browser.close(),
  );
});

test('editable operands never enter geometry or either native keyboard receipt through control names', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({ viewport: { width: 960, height: 1142 } });
      const privateOperand = 'synthetic-private-editable-operand';
      await page.setContent(`
        <style>input,textarea,button,summary{display:block;min-height:44px}
        :focus-visible{outline:3px solid blue;outline-offset:2px}</style>
        <main><label for="draft">Public draft label</label>
        <textarea id="draft">${privateOperand}</textarea>
        <label>Wrapped public label <textarea id="wrapped">${privateOperand}</textarea></label>
        <span id="first-label">Referenced</span><span id="last-label">public label</span>
        <textarea aria-labelledby="first-label last-label" aria-label="Lower priority label">${privateOperand}</textarea>
        <input aria-label="Explicit public label" value="${privateOperand}">
        <textarea>${privateOperand}</textarea>
        <label id="nested-label">Nested public label<textarea tabindex="-1">${privateOperand}</textarea></label>
        <input aria-labelledby="nested-label" value="${privateOperand}">
        <input aria-labelledby="draft" value="${privateOperand}">
        <textarea aria-label="Direct public label">${privateOperand}</textarea>
        <button>Continue</button><details><summary>Public evidence</summary></details></main>
      `);
      // React-controlled textarea publication can retain the operand in both properties.
      expect(await page.locator('#draft').textContent()).toBe(privateOperand);
      expect(await page.locator('#draft').inputValue()).toBe(privateOperand);
      const geometry = await measureAccessibility(page);
      const keyboard = await walkKeyboard(page);
      expect(
        JSON.stringify({ geometry, keyboard }).includes(privateOperand),
        'Private editable values must not enter any measured receipt field',
      ).toBe(false);
      const expectedNames = [
        'Public draft label',
        'Wrapped public label',
        'Referenced public label',
        'Explicit public label',
        '[editable control; value private]',
        'Nested public label',
        '[editable control; value private]',
        'Direct public label',
        'Continue',
        'Public evidence',
      ];
      expect(keyboard.expected.map((control) => control.name)).toEqual(expectedNames);
      expect(geometry.targets.map((control) => control.name)).toEqual([
        ...expectedNames.slice(0, 5),
        'Nested public label',
        ...expectedNames.slice(5),
      ]);
      expect(keyboard.inventoryChanged).toBe(false);
      expect(keyboard.directions.map((direction) => direction.missing)).toEqual([[], []]);
      for (const direction of keyboard.directions) {
        expect(direction.steps).toHaveLength(expectedNames.length);
        for (const step of direction.steps)
          expect(step.name).toBe(
            keyboard.expected.find((control) => control.identity === step.identity)!.name,
          );
      }
      // Collection must not clear a draft or replace native traversal to obtain privacy.
      expect(await page.locator('#draft').inputValue()).toBe(privateOperand);
      expect(await page.locator('#wrapped').inputValue()).toBe(privateOperand);
    },
    () => browser.close(),
  );
});

test('opaque contrast is numerical; composed paint and shadow-only candidates remain explicit triage', () => {
  expect(
    assessContrast({ foreground: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)' }, 4.5),
  ).toMatchObject({ status: 'computed', ratio: 21 });
  expect(
    assessContrast({ foreground: 'rgb(255, 255, 255)', background: 'rgb(255, 255, 255)' }, 4.5)
      .ratio,
  ).toBe(1);
  for (const role of [
    { foreground: 'rgba(0, 0, 0, 0.5)', background: 'rgb(255, 255, 255)' },
    { foreground: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)', sceneOverlay: true },
    { foreground: 'rgb(0, 0, 0)', background: 'rgb(255, 255, 255)', painted: false },
    {
      foreground: 'rgb(0, 0, 0)',
      background: 'rgb(255, 255, 255)',
      backgroundImages: ['linear-gradient(black,white)'],
    },
  ])
    expect(assessContrast(role, 3)).toMatchObject({ status: 'manual', ratio: null });
});

test('heading-free error state consumes the actual strong-text font and contrast', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage();
      await page.setContent(
        '<style>main{font-family:Barlow,sans-serif;color:#000;background:#fff}.child{color:#fff;background:#000;font-family:serif}</style><main><div class="system-error"><div role="alert"><div><strong>Place could not be read</strong></div></div><button>Try again</button></div><p>Parent <span class="child">Different child</span></p><ul><li>Direct list item <em>Emphasis</em></li></ul><table><tbody><tr><td>Cell value</td></tr></tbody></table><svg><text fill="red" style="color:blue">SVG glyph</text><text id="ambiguous-svg" y="40" fill="black" stroke="white">Stroked glyph</text></svg><textarea aria-label="Private">secret operand</textarea></main>',
      );
      const measured = await measureAccessibility(page);
      expect(measured.fonts.content).toMatchObject({
        text: 'Place could not be read',
        family: 'Barlow, sans-serif',
      });
      const alert = measured.textRoles.find((role) => role.tag === 'STRONG')!;
      expect(alert.text).toBe('Place could not be read');
      expect(assessContrast({ ...alert, foreground: alert.color }, 4.5)).toMatchObject({
        status: 'computed',
        ratio: 21,
      });
      const child = measured.textRoles.find((role) => role.text === 'Different child')!;
      expect(child).toMatchObject({ color: 'rgb(255, 255, 255)', fontFamily: 'serif' });
      expect(measured.textRoles.find((role) => role.tag === 'P')!.text).toBe('Parent');
      for (const text of ['Direct list item', 'Emphasis', 'Cell value'])
        expect(
          measured.textRoles.some((role) => role.text === text),
          text,
        ).toBe(true);
      const svg = measured.textRoles.find((role) => role.text === 'SVG glyph')!;
      expect(svg.color).toBe('rgb(255, 0, 0)');
      expect(assessContrast({ ...svg, foreground: svg.color }, 4.5)).toMatchObject({
        status: 'computed',
      });
      expect(assessContrast({ ...svg, foreground: svg.color }, 4.5).ratio).toBeGreaterThan(3);
      const ambiguous = measured.textRoles.find((role) => role.text === 'Stroked glyph')!;
      expect(ambiguous.selector).toBe('#ambiguous-svg');
      expect(assessContrast({ ...ambiguous, foreground: ambiguous.color }, 4.5)).toMatchObject({
        status: 'manual',
        reasons: expect.arrayContaining([
          expect.stringContaining('SVG glyph stroke/fill edge composition'),
        ]),
      });
      expect(JSON.stringify(measured)).not.toContain('secret operand');
      await page.setContent('<main><textarea aria-label="Private">only secret</textarea></main>');
      const privateOnly = await measureAccessibility(page);
      expect(privateOnly.fonts.content).toBeNull();
      expect(JSON.stringify(privateOnly)).not.toContain('only secret');
    },
    () => browser.close(),
  );
});

test('primary consumers keep contrast on natural enabled frames; measurement observes other real transitions', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage();
      const css = (
        await Promise.all(
          ['tokens', 'components', 'place', 'search', 'ask'].map((file) =>
            readFile(new URL(`../../apps/web/src/styles/${file}.css`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      await page.setContent(
        `<style>${css}</style><div class="rei"><section class="ask-follow"><button class="btn btn--primary" disabled>Observe example</button></section><section class="search-filters"><div class="search-filters__actions"><button class="btn btn--primary" type="submit" disabled>Apply filters</button></div></section><section class="ask-confirmation__actions"><button class="btn">Local confirmation</button></section></div>`,
      );
      const enabledFrames = await page.locator('.btn--primary').evaluateAll(async (elements) => {
        const buttons = elements as HTMLButtonElement[];
        for (const button of buttons) {
          getComputedStyle(button).getPropertyValue('background-color');
          button.disabled = false;
        }
        const frames = [];
        for (let index = 0; index < 3; index++) {
          await new Promise(requestAnimationFrame);
          for (const button of buttons) {
            const style = getComputedStyle(button);
            frames.push({
              text: button.textContent,
              foreground: style.color,
              background: style.backgroundColor,
            });
          }
        }
        return frames;
      });
      expect(enabledFrames).toHaveLength(6);
      for (const frame of enabledFrames)
        expect(assessContrast(frame, 4.5).ratio, JSON.stringify(frame)).toBeGreaterThanOrEqual(4.5);
      // Ask's local confirmation is a normal .btn (not primary), with no busy/disabled binding.
      await page.locator('.ask-confirmation__actions button').hover();
      const measured = await measureAccessibility(page);
      expect(measured.paintSettle.pendingTransitions).toContain('background-color');
      for (const text of measured.textRoles.filter((role) => role.tag === 'BUTTON'))
        expect(
          assessContrast({ ...text, foreground: text.color }, 4.5).ratio,
        ).toBeGreaterThanOrEqual(4.5);
    },
    () => browser.close(),
  );
});

test('actual segmented and language CSS keeps native forward/reverse outlines painted inside clipped groups', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({
        viewport: { width: 390, height: 800 },
        reducedMotion: 'reduce',
      });
      const css = (
        await Promise.all(
          ['tokens', 'components', 'place', 'search'].map((file) =>
            readFile(new URL(`../../apps/web/src/styles/${file}.css`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      await page.setContent(
        `<style>${css}</style><div class="rei place-app"><section class="search-filters"><div class="seg"><button aria-pressed="true">Any</button><button>1</button><button>2</button><button>3</button><button>4+</button></div></section></div><div class="rei place-app"><form class="ask__box"><input aria-label="Ask"><button>Continue</button></form><footer class="public-footer"><div class="lang"><button aria-pressed="true">English</button><button>Portuguese</button></div></footer></div>`,
      );
      // Cache ageing must not patch the real RAF/timer/paint oracle.
      // A mobile Filters sheet intentionally hides its own shell/footer. Language controls
      // belong to the separate non-sheet consumer, not an impossible combined screen.
      expect(await page.locator('.public-footer').isVisible()).toBe(true);
      const receipt = await walkKeyboard(page);
      expect(receipt.expected.map((entry) => entry.name)).toEqual([
        'Any',
        '1',
        '2',
        '3',
        '4+',
        'Ask',
        'Continue',
        'English',
        'Portuguese',
      ]);
      expect(receipt.inventoryChanged).toBe(false);
      for (const direction of receipt.directions) {
        expect(direction.missing).toEqual([]);
        expect(
          direction.steps.filter(
            (step) =>
              step.clippedBy.length || !step.focusVisible || !step.indicator || !step.unobscured,
          ),
        ).toEqual([]);
        for (const step of direction.steps)
          expect(
            assessContrast(step.focusContrast, 3).ratio,
            JSON.stringify(step),
          ).toBeGreaterThanOrEqual(3);
      }
    },
    () => browser.close(),
  );
});

test('language control inset is stable before, during and after native traversal', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({ reducedMotion: 'reduce' });
      const css = (
        await Promise.all(
          ['tokens', 'components', 'place'].map((file) =>
            readFile(new URL(`../../apps/web/src/styles/${file}.css`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      for (const width of [390, 960]) {
        await page.setViewportSize({ width, height: 1142 });
        for (const locale of ['pt-BR', 'en']) {
          const languages = `<div class="lang"><button aria-label="Português" aria-pressed="${locale === 'pt-BR'}">PT</button><button aria-label="English" aria-pressed="${locale === 'en'}">EN</button></div>`;
          await page.setContent(
            `<style>${css}</style><div class="rei place-app"><aside class="rail place-rail">${languages}</aside><div class="main place-main"><header class="shell place-top">${languages}</header><main>Public content</main><footer class="public-footer">${languages}</footer></div></div>`,
          );
          const offsets = () =>
            page
              .locator('.lang button')
              .evaluateAll((buttons) =>
                buttons.map((button) => getComputedStyle(button).outlineOffset),
              );
          const insetOffsets = Array<string>(6).fill('-5px');
          expect(
            await offsets(),
            'Clipped language controls keep their inset before focus',
          ).toEqual(insetOffsets);
          for (let cycle = 0; cycle < 2; cycle++) {
            const receipt = await walkKeyboard(page);
            expect(receipt.inventoryChanged).toBe(false);
            for (const direction of receipt.directions) {
              expect(direction.missing).toEqual([]);
              expect(direction.steps.length).toBeGreaterThan(0);
              for (const step of direction.steps) {
                expect(step.outline.offset, JSON.stringify({ width, locale, cycle, step })).toBe(
                  '-5px',
                );
                expect(step.clippedBy).toEqual([]);
                expect(step.focusVisible && step.indicator && step.unobscured).toBe(true);
                expect(assessContrast(step.focusContrast, 3).ratio).toBeGreaterThanOrEqual(3);
              }
            }
            expect(await offsets(), 'Leaving focus does not reset clipped-ring geometry').toEqual(
              insetOffsets,
            );
          }
        }
      }
    },
    () => browser.close(),
  );
});

test('Ask submit inset is stable before, during and after native traversal', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({
        viewport: { width: 390, height: 1142 },
        reducedMotion: 'reduce',
      });
      const css = (
        await Promise.all(
          ['tokens', 'components', 'place'].map((file) =>
            readFile(new URL(`../../apps/web/src/styles/${file}.css`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      await page.setContent(
        `<style>${css}</style><div class="rei place-app"><main id="place-overview"><header class="place-head"><div class="place-question-region"><form class="ask place-question"><label for="place-question">Ask about Bela Vista</label><div class="ask__box"><input id="place-question" required><button type="submit">Continue</button></div></form></div></header><details><summary>Evidence</summary><a href="#place-question">Source</a></details><button>Try again</button></main></div>`,
      );
      const inset = () =>
        page
          .locator('.ask__box button')
          .evaluate((button) => getComputedStyle(button).outlineOffset);
      expect(
        await inset(),
        'The clipped submit keeps its inset before focus style publication',
      ).toBe('-5px');
      for (let cycle = 0; cycle < 4; cycle++) {
        const receipt = await walkKeyboard(page);
        for (const direction of receipt.directions) {
          expect(direction.missing).toEqual([]);
          const submit = direction.steps.find((step) => step.name === 'Continue')!;
          expect(
            submit.outline.offset,
            JSON.stringify({ cycle, direction: direction.key, submit }),
          ).toBe('-5px');
          expect(submit.clippedBy).toEqual([]);
          expect(assessContrast(submit.focusContrast, 3).ratio).toBeGreaterThanOrEqual(3);
        }
        expect(await inset(), 'Leaving native focus must not reset its clipped-ring geometry').toBe(
          '-5px',
        );
      }
    },
    () => browser.close(),
  );
});

test('landing sticky controls keep their visual footprint inside the scene at the journey boundary', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage();
      const css = (
        await Promise.all([
          readFile(new URL('../../apps/web/src/styles/tokens.css', import.meta.url), 'utf8'),
          readFile(new URL('../../apps/web/src/landing/landing.css', import.meta.url), 'utf8'),
        ])
      ).join('\n');
      // The 720x400 CSS viewport is the geometry regression; the campaign separately proves
      // real native browser 200% zoom. Neither this test nor the paint oracle patches clocks.
      const viewports = [
        { width: 390, height: 800 },
        { width: 960, height: 800 },
        { width: 1440, height: 800 },
        { width: 720, height: 400 },
      ];
      for (const { viewport, reducedMotion } of viewports.flatMap((viewport) =>
        (['reduce', 'no-preference'] as const).map((reducedMotion) => ({
          viewport,
          reducedMotion,
        })),
      )) {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion });
        await page.setContent(
          `<style>${css}</style><div class="lp"><header class="lp-top"><a class="lp-brand" href="#run">Brand</a></header><section class="lp-journey"><div class="lp-controls">${reducedMotion === 'reduce' ? '' : '<button class="lp-motion">Pausar movimento</button>'}<nav class="lp-way"><ol>${['Cidade', 'Bairro', 'Imóvel', 'Quadra', 'Coletores'].map((name, index) => `<li><a href="#${index ? 'last' : 'first'}" ${index ? '' : 'aria-current="step"'}><span class="lp-way__mark"></span><span class="lp-way__name">${name}</span></a></li>`).join('')}</ol></nav></div><div class="lp-stage"></div><div class="lp-stops"><section class="lp-stop" id="first"><div class="lp-copy"><h1>First stop</h1></div></section><section class="lp-stop" id="last"><div class="lp-copy"><h2>Last stop</h2></div></section></div></section><section class="lp-run" id="run" style="min-height:150vh"><h2>Light following section</h2><a href="#first">Return</a></section></div>`,
        );
        await page.keyboard.press('Control+End');
        await expect
          .poll(() => page.locator('.lp-run').evaluate((run) => run.getBoundingClientRect().top))
          .toBeLessThan(0);
        const boundary = await page.locator('.lp-journey').evaluate((journey) => ({
          journeyBottom: journey.getBoundingClientRect().bottom,
          navBottom: document.querySelector('.lp-way')!.getBoundingClientRect().bottom,
          stageBottom: document.querySelector('.lp-stage')!.getBoundingClientRect().bottom,
        }));
        expect(boundary.navBottom, JSON.stringify({ viewport, boundary })).toBeLessThanOrEqual(
          boundary.journeyBottom,
        );
        expect(boundary.stageBottom).toBeCloseTo(boundary.journeyBottom, 0);
        const receipt = await walkKeyboard(page);
        expect(receipt.inventoryChanged).toBe(false);
        for (const direction of receipt.directions) {
          expect(direction.missing).toEqual([]);
          expect(
            direction.steps.filter(
              (step) =>
                step.clippedBy.length || !step.focusVisible || !step.indicator || !step.unobscured,
            ),
          ).toEqual([]);
        }
        await page.keyboard.press('Control+End');
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        // Capture reset is explicitly outside the saved, untouched native traversal.
        expect(await settlePropertyCaptureStart(page)).toEqual({
          x: 0,
          y: 0,
          documentTop: 0,
          documentLeft: 0,
        });
        expect(
          await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior),
        ).toBe(reducedMotion === 'reduce' ? 'auto' : 'smooth');
      }
    },
    () => browser.close(),
  );
});

test('landing navigation is opaque and desktop copy has a conservative scrim contrast bound', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({ reducedMotion: 'reduce' });
      const css = (
        await Promise.all([
          readFile(new URL('../../apps/web/src/styles/tokens.css', import.meta.url), 'utf8'),
          readFile(new URL('../../apps/web/src/landing/landing.css', import.meta.url), 'utf8'),
        ])
      ).join('\n');
      for (const width of [390, 960, 1440, 2560]) {
        await page.setViewportSize({ width, height: 1142 });
        // This is an isolated paint/geometry regression with actual consumer CSS, not a
        // fabricated production journey or a replacement for visual canvas adjudication.
        await page.setContent(
          `<style>${css}</style><div class="lp"><header class="lp-top">Brand</header><section class="lp-journey"><div class="lp-controls"><nav class="lp-way"><ol>${['Cidade', 'Zona', 'Bairro', 'Quadra', 'Coletores'].map((name, index) => `<li><a href="#stop" ${index ? '' : 'aria-current="step"'}><span class="lp-way__mark"></span><span class="lp-way__name">${name}</span></a></li>`).join('')}</ol></nav></div><div class="lp-stage"><canvas class="lp-canvas"></canvas><div class="lp-scrim"></div></div><div class="lp-stops"><section class="lp-stop" id="stop"><div class="lp-copy"><h1 class="lp-h1">A cidade explicada por cada imóvel.</h1><p class="lp-lead">Illustrative asking prices, not recorded transactions.</p><p class="lp-prov">Synthetic data, with sources and dates.</p></div></section></div></section></div>`,
        );
        const measured = await measureAccessibility(page);
        const names = measured.textRoles.filter((role) => role.className === 'lp-way__name');
        expect(names.length).toBeGreaterThan(0);
        for (const role of names) {
          if (role.rect.width <= 1) continue; // The mobile non-current names are screen-reader only.
          const contrast = assessContrast({ ...role, foreground: role.color }, 4.5);
          expect.soft(contrast.status, `${width}: ${role.text}`).toBe('computed');
          expect.soft(contrast.ratio ?? 0, `${width}: ${role.text}`).toBeGreaterThanOrEqual(4.5);
        }
        if (width < 960) continue; // Mobile copy has its own opaque enamel-900 sheet.
        const paint = await page.evaluate(() => {
          const stage = document.querySelector('.lp-stage')!;
          const scrim = document.querySelector('.lp-scrim')!;
          const copy = document.querySelector('.lp-copy')!;
          const background = getComputedStyle(scrim).backgroundImage;
          return {
            gradient: background,
            stops: Array.from(background.matchAll(/rgba?\(([^)]+)\) ([\d.]+)%/g), (match) => ({
              components: match[1]!.split(',').map(Number),
              percent: Number(match[2]),
            })),
            copyEnd:
              ((copy.getBoundingClientRect().right - stage.getBoundingClientRect().left) /
                stage.getBoundingClientRect().width) *
              100,
            scrimWidth: scrim.getBoundingClientRect().width,
            stageWidth: stage.getBoundingClientRect().width,
            opacity: getComputedStyle(scrim).opacity,
            blend: getComputedStyle(scrim).mixBlendMode,
            filter: getComputedStyle(scrim).filter,
            colors: Array.from(
              copy.querySelectorAll('h1,p'),
              (element) => getComputedStyle(element).color,
            ),
          };
        });
        expect(paint.gradient).toContain('linear-gradient(90deg,');
        expect(paint.stops).toHaveLength(3);
        expect(paint.scrimWidth).toBe(paint.stageWidth);
        expect(paint).toMatchObject({ opacity: '1', blend: 'normal', filter: 'none' });
        const [first, second] = paint.stops;
        expect(first!.percent).toBe(0);
        expect
          .soft(second!.percent, `${width}: entire copy must precede fading`)
          .toBeGreaterThanOrEqual(paint.copyEnd);
        expect(first!.components.slice(0, 3)).toEqual(second!.components.slice(0, 3));
        const minimumAlpha = Math.min(first!.components[3]!, second!.components[3]!);
        expect(minimumAlpha).toBeGreaterThanOrEqual(0.9);
        // White maximizes each underlying sRGB channel. This bounds every possible canvas
        // pixel, not just one camera/lighting sample; rounding upward is conservative.
        const brightestGround = second!.components
          .slice(0, 3)
          .map((channel) => Math.ceil(channel * minimumAlpha + 255 * (1 - minimumAlpha)));
        for (const foreground of paint.colors)
          expect(
            assessContrast({ foreground, background: `rgb(${brightestGround.join(',')})` }, 4.5)
              .ratio,
            `${width}: ${foreground} on the brightest bounded scrim ground`,
          ).toBeGreaterThanOrEqual(4.5);
      }
    },
    () => browser.close(),
  );
});

test('provenance badges reflow inside narrow neighbour and monthly evidence columns', async () => {
  const env = { ...process.env };
  delete env.DISPLAY;
  const browser = await chromium.launch({
    channel: 'chromium',
    chromiumSandbox: true,
    env,
    args: ['--ozone-platform=headless'],
  });
  await preserveCleanup(
    async () => {
      const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
      const css = (
        await Promise.all(
          ['tokens', 'components', 'place'].map((file) =>
            readFile(new URL(`../../apps/web/src/styles/${file}.css`, import.meta.url), 'utf8'),
          ),
        )
      ).join('\n');
      await page.setContent(
        `<style>${css}</style><div class="rei place-app"><section class="panel place-neighbours"><ul><li class="place-neighbour"><a href="#place">Neighbour</a><div class="place-neighbour__median">Median</div><div class="place-neighbour__movement"><details open><summary>Evidence</summary><div class="prov place-provenance"><span>3 properties</span><span class="tag tag--synthetic">Dados sintéticos</span></div></details></div></li></ul></section><section class="place-series"><div class="place-series-table"><table><tbody><tr><th>Month</th><td><details open><summary>Evidence</summary><div class="prov place-provenance"><span class="tag tag--synthetic">Synthetic data</span></div></details></td><td>Comparison</td></tr></tbody></table></div></section></div>`,
      );
      const badges = await page.locator('.place-provenance .tag').evaluateAll((elements) =>
        elements.map((element) => ({
          right: element.getBoundingClientRect().right,
          parentRight: element.parentElement!.getBoundingClientRect().right,
          text: element.textContent,
        })),
      );
      for (const badge of badges)
        expect(badge.right, JSON.stringify(badge)).toBeLessThanOrEqual(badge.parentRight);
      expect((await measureAccessibility(page)).overflow).toBe(false);
    },
    () => browser.close(),
  );
});
