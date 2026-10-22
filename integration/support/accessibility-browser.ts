import type { BrowserContext, Page } from 'playwright';
import { expect } from 'vitest';

/** Await descendant publication with the existing page-readiness bound, then compare exact IDs. */
export async function prepareAccessibilityHierarchy(
  page: Page,
  expected: {
    navigation?: readonly string[];
    filters?: readonly string[];
  },
) {
  if (expected.navigation) {
    if (expected.navigation.length)
      await page
        .locator('.place-navigation a')
        .nth(expected.navigation.length - 1)
        .waitFor({ state: 'attached' });
    await expect
      .poll(() =>
        page
          .locator('.place-navigation a')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute('href')?.split('/').at(-1)),
          ),
      )
      .toEqual(expected.navigation);
  }
  if (expected.filters) {
    if (expected.filters.length)
      await page
        .locator('#filter-place option')
        .nth(expected.filters.length - 1)
        .waitFor({ state: 'attached' });
    await expect
      .poll(() =>
        page
          .locator('#filter-place option')
          .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value)),
      )
      .toEqual(expected.filters);
  }
}

/** Preparation must use the visible shell entry, not the mobile-only footer at desktop. */
export const publicLocaleControlSelector = (locale: 'pt-BR' | 'en') =>
  `.lp-lang button[lang="${locale}"], .place-top .lang button[lang="${locale}"], .place-rail .lang button[lang="${locale}"], .listing-details .property-return .lang button[lang="${locale}"]`;

export const publicPrivacyEntrySelector =
  '.public-footer a[href="/privacy"], .place-rail a[href="/privacy"]';

/** Read in the browser; an opaque ancestor is not an effective ground over sibling canvas paint. */
function describePaint(element: Element, start: Element | null = element) {
  let background = 'rgb(255, 255, 255)';
  let resolvedGround: Element | null = null;
  const backgroundImages: string[] = [];
  for (let parent = start; parent; parent = parent.parentElement) {
    const css = getComputedStyle(parent);
    if (css.backgroundImage !== 'none') backgroundImages.push(css.backgroundImage);
    if (css.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      background = css.backgroundColor;
      resolvedGround = parent;
      break;
    }
  }
  let opacity = 1;
  const blendModes: string[] = [];
  const path: string[] = [];
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const css = getComputedStyle(parent);
    opacity *= Number(css.opacity);
    if (css.mixBlendMode !== 'normal') blendModes.push(css.mixBlendMode);
    if (parent.id) {
      if (!path.some((part) => part.startsWith('#'))) path.unshift(`#${parent.id}`);
    } else if (!path.some((part) => part.startsWith('#'))) {
      const siblings = parent.parentElement
        ? Array.from(parent.parentElement.children).filter(
            (child) => child.tagName === parent!.tagName,
          )
        : [parent];
      path.unshift(`${parent.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(parent) + 1})`);
    }
  }
  const copy = element.closest('.lp-copy');
  const sceneOverlay =
    (!!element.closest('.lp-way') ||
      !!(copy && getComputedStyle(copy).backgroundColor === 'rgba(0, 0, 0, 0)')) &&
    !!resolvedGround?.matches('.lp,.lp-stage,body,html');
  const rect = element.getBoundingClientRect();
  const scrim = sceneOverlay ? document.querySelector('.lp-scrim') : null;
  return {
    selector: path.join(' > '),
    background,
    backgroundImages,
    opacity,
    blendModes,
    sceneOverlay,
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      documentY: rect.y + scrollY,
    },
    scrim: scrim
      ? {
          backgroundImage: getComputedStyle(scrim).backgroundImage,
          rect: scrim.getBoundingClientRect().toJSON(),
        }
      : null,
    disabled: element.matches(':disabled') || !!element.closest('[aria-disabled="true"]'),
  };
}

/** Numerical verdicts only for genuinely opaque, painted pairs. Other paint is explicit triage. */
export function assessContrast(
  role: {
    foreground: string;
    background: string;
    opacity?: number;
    backgroundImages?: readonly string[];
    blendModes?: readonly string[];
    sceneOverlay?: boolean;
    disabled?: boolean;
    painted?: boolean;
    paintLimitation?: string;
  },
  minimum: number,
) {
  const parse = (color: string) => {
    if (!/^rgba?\(/.test(color)) return null;
    const channels = color.match(/[\d.]+/g)?.map(Number);
    return channels?.length === 3 || channels?.length === 4 ? channels : null;
  };
  const foreground = parse(role.foreground),
    background = parse(role.background);
  const reasons: string[] = [];
  if (role.paintLimitation) reasons.push(role.paintLimitation);
  if (role.painted === false)
    reasons.push('Shadow-only or unpainted candidate is not a measured indicator');
  if (!foreground || !background) reasons.push('Unsupported computed color space');
  if ((foreground?.[3] ?? 1) !== 1 || (background?.[3] ?? 1) !== 1)
    reasons.push('Alpha composition requires explicit ground adjudication');
  if ((role.opacity ?? 1) !== 1) reasons.push('Element/ancestor opacity composition');
  if (role.backgroundImages?.length) reasons.push('Background image/gradient spatial composition');
  if (role.blendModes?.length) reasons.push('Non-normal blend mode');
  if (role.sceneOverlay)
    reasons.push('Sibling canvas/scrim paint; opaque ancestor is not effective background');
  const luminance = (channels: number[]) =>
    channels
      .slice(0, 3)
      .map((value) => {
        const linear = value / 255;
        return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!, 0);
  const a = foreground ? luminance(foreground) : 0,
    b = background ? luminance(background) : 0;
  const status = role.disabled ? 'exempt-disabled' : reasons.length ? 'manual' : 'computed';
  return {
    status,
    ratio: status === 'computed' ? (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) : null,
    minimum,
    reasons,
    method:
      'WCAG sRGB relative luminance; no alpha, gradient, shadow or canvas inference accepted as opaque paint proof',
  };
}

/** Native traversal receipts. Controls are never focused or scrolled into reach by this helper. */
export async function walkKeyboard(
  page: Page,
  onEvidenceStop?: (step: {
    direction: string;
    index: number;
    identity: string;
    problem: boolean;
  }) => Promise<void>,
) {
  const selector = 'a[href],button,summary,input,select,textarea,[tabindex]';
  // A structural path is unaffected by asynchronously inserted controls in other sections.
  const identify = (element: Element) => {
    const path: string[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      if (node.id) {
        path.unshift(`#${node.id}`);
        break;
      }
      const siblings = node.parentElement
        ? Array.from(node.parentElement.children).filter(
            (sibling) => sibling.tagName === node!.tagName,
          )
        : [node];
      path.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
    }
    return path.join(' > ');
  };
  const identitySource = identify.toString();
  const paintSource = describePaint.toString();
  const expected = await page.locator(selector).evaluateAll((elements, source) => {
    const identity = new Function(`return (${source})`)() as (element: Element) => string;
    return elements.flatMap((element) => {
      const html = element as HTMLElement;
      const style = getComputedStyle(html);
      if (
        html.tabIndex < 0 ||
        html.matches(':disabled,[inert]') ||
        html.closest('[inert]') ||
        html.closest('details:not([open]) > :not(summary)') ||
        !html.getClientRects().length ||
        style.visibility === 'hidden' ||
        style.display === 'none'
      )
        return [];
      return [
        {
          identity: identity(html),
          name: html.getAttribute('aria-label') ?? html.textContent?.trim().slice(0, 160) ?? '',
          tag: html.tagName,
        },
      ];
    });
  }, identitySource);
  const directions = [];
  for (const key of ['Tab', 'Shift+Tab']) {
    const steps = [];
    const browserChromeTransitions: Array<{ documentFocused: boolean; activeTag: string | null }> =
      [];
    const seen = new Set<string>();
    // One complete cycle plus the initial partial cycle, bounded by the actual control count.
    for (let index = 0; index < expected.length * 2 + 8; index++) {
      await page.keyboard.press(key);
      // Let CSS focus/scroll and compositor hit testing settle naturally. This neither focuses
      // nor scrolls a control and avoids sampling the previous stop's painted bypass link.
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const step = await page.evaluate(
        ({ source, paintSource }) => {
          const element = document.activeElement;
          // Full Chromium also tabs through browser chrome. activeElement is retained while the
          // document is unfocused; that is not another product focus stop (nor a hidden skip link).
          if (
            !document.hasFocus() ||
            !(element instanceof HTMLElement) ||
            element === document.body
          )
            return {
              transition: {
                documentFocused: document.hasFocus(),
                activeTag: element?.tagName ?? null,
              },
            };
          const identify = new Function(`return (${source})`)() as (element: Element) => string;
          const identity = identify(element);
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          const paint = new Function(`return (${paintSource})`)() as typeof describePaint;
          const focusWithin = element.parentElement?.matches(':focus-within')
            ? getComputedStyle(element.parentElement)
            : null;
          const ownOutline = style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
          const ownBorder =
            !ownOutline && style.boxShadow !== 'none' && parseFloat(style.borderWidth) > 0;
          const parentIndicator =
            !ownOutline && style.boxShadow === 'none' && focusWithin?.boxShadow !== 'none';
          const backgroundElement =
            ownOutline && parseFloat(style.outlineOffset) < 0 ? element : element.parentElement;
          let ground = backgroundElement;
          let focusBackground = 'rgb(255, 255, 255)';
          while (ground) {
            const color = getComputedStyle(ground).backgroundColor;
            if (color !== 'rgba(0, 0, 0, 0)') {
              focusBackground = color;
              break;
            }
            ground = ground.parentElement;
          }
          const focusColor = ownOutline
            ? style.outlineColor
            : parentIndicator && focusWithin
              ? focusWithin.borderColor
              : style.borderColor;
          const focusMethod = ownOutline
            ? 'painted outline'
            : ownBorder
              ? 'painted focus border; shadow remains manual'
              : parentIndicator && focusWithin && parseFloat(focusWithin.borderWidth) > 0
                ? 'painted enclosing focus-within border; shadow remains manual'
                : 'shadow-only; manual interpretation required';
          const x = Math.max(0, Math.min(innerWidth - 1, rect.x + rect.width / 2));
          const y = Math.max(0, Math.min(innerHeight - 1, rect.y + rect.height / 2));
          const hit = document.elementFromPoint(x, y);
          const clippedBy = [];
          for (let parent = element.parentElement; parent; parent = parent.parentElement) {
            const css = getComputedStyle(parent),
              bounds = parent.getBoundingClientRect();
            const offset = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
            if (
              style.outlineStyle !== 'none' &&
              ((['hidden', 'clip'].includes(css.overflowX) &&
                (rect.left - offset < bounds.left || rect.right + offset > bounds.right)) ||
                (['hidden', 'clip'].includes(css.overflowY) &&
                  (rect.top - offset < bounds.top || rect.bottom + offset > bounds.bottom)))
            )
              clippedBy.push(parent.className || parent.tagName);
          }
          return {
            identity,
            landingControl: !!element.closest('.lp-controls'),
            documentFocused: document.hasFocus(),
            focused: element.matches(':focus'),
            focusContrast: {
              ...paint(element, backgroundElement),
              painted:
                ownOutline ||
                ownBorder ||
                !!(parentIndicator && focusWithin && parseFloat(focusWithin.borderWidth) > 0),
              indicator: focusMethod,
              foreground: focusColor,
              background: focusBackground,
              method:
                'Candidate ground: inset uses control, outside uses ancestor. assessContrast adjudicates opaque paint versus alpha/gradient/shadow/canvas limits.',
            },
            name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 160),
            focusVisible: element.matches(':focus-visible'),
            indicator:
              (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) ||
              style.boxShadow !== 'none' ||
              !!(focusWithin && focusWithin.boxShadow !== 'none'),
            enclosingFocusIndicator: focusWithin?.boxShadow ?? null,
            outline: {
              color: style.outlineColor,
              width: style.outlineWidth,
              offset: style.outlineOffset,
            },
            visible:
              rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth,
            unobscured: hit === element || element.contains(hit),
            hit: hit ? { tag: hit.tagName, className: hit.className, id: hit.id } : null,
            scroll: { x: scrollX, y: scrollY },
            clippedBy,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          };
        },
        { source: identitySource, paintSource },
      );
      if (step.transition) {
        browserChromeTransitions.push(step.transition);
        continue;
      }
      if (seen.has(step.identity)) break;
      seen.add(step.identity);
      steps.push(step);
      const problem =
        !step.focusVisible ||
        !step.indicator ||
        !step.visible ||
        !step.unobscured ||
        step.clippedBy.length > 0;
      if (onEvidenceStop && (problem || step.landingControl))
        await onEvidenceStop({ direction: key, index, identity: step.identity, problem });
    }
    directions.push({
      key,
      steps,
      browserChromeTransitions,
      missing: expected.filter((control) => !seen.has(control.identity)),
    });
  }
  const finalIdentities = await page.locator(selector).evaluateAll((elements, source) => {
    const identify = new Function(`return (${source})`)() as (element: Element) => string;
    return elements
      .filter(
        (element) =>
          (element as HTMLElement).tabIndex >= 0 &&
          !(element as HTMLElement).matches(':disabled') &&
          !element.closest('[inert]') &&
          !element.closest('details:not([open]) > :not(summary)') &&
          element.getClientRects().length &&
          getComputedStyle(element).visibility !== 'hidden' &&
          getComputedStyle(element).display !== 'none',
      )
      .map(identify);
  }, identitySource);
  return {
    expected,
    finalIdentities,
    directions,
    inventoryChanged:
      expected.map((element) => element.identity).join('|') !== finalIdentities.join('|'),
  };
}

/** Measurement only: native scroll/focus is left intact, including any failed observation. */
export async function measureAccessibility(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const startedAt = Date.now();
  const pendingTransitions = await page.evaluate(() =>
    document
      .getAnimations()
      .filter(
        (animation) => animation instanceof CSSTransition && animation.playState === 'running',
      )
      .map((animation) => (animation as CSSTransition).transitionProperty),
  );
  // A data-read commit can enable a button before its real background transition finishes.
  // Observe completion; do not disable motion, patch clocks, or substitute an expected token.
  await page.waitForFunction(
    () =>
      !document
        .getAnimations()
        .some(
          (animation) => animation instanceof CSSTransition && animation.playState === 'running',
        ),
    undefined,
    { timeout: 5000 },
  );
  const measured = await page.evaluate((paintSource) => {
    const paint = new Function(`return (${paintSource})`)() as typeof describePaint;
    const directText = (element: Element) =>
      Array.from(element.childNodes)
        .filter((node) => {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) return false;
          const range = document.createRange();
          range.selectNodeContents(node);
          return Array.from(range.getClientRects()).some((rect) => rect.width && rect.height);
        })
        .map((node) => node.textContent)
        .join(' ')
        .trim();
    const textElements = Array.from(document.querySelectorAll('*'))
      .filter(
        (element): element is HTMLElement | SVGTextContentElement =>
          element instanceof HTMLElement || element instanceof SVGTextContentElement,
      )
      .filter(
        (element) =>
          element.checkVisibility() &&
          !element.closest('script,style,template,noscript,canvas,[aria-hidden="true"]') &&
          !element.closest('details:not([open]) > :not(summary)') &&
          (element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLSelectElement ||
            !!directText(element)),
      );
    return {
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      overflow: document.documentElement.scrollWidth > innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      fonts: {
        body: getComputedStyle(document.body).fontFamily,
        content: (() => {
          const element = textElements.find(
            (element) =>
              !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
              element.closest('main,.lp-copy') &&
              !!directText(element),
          );
          return element
            ? {
                text: directText(element).slice(0, 100),
                family: getComputedStyle(element).fontFamily,
              }
            : null;
        })(),
        size: getComputedStyle(document.body).fontSize,
        barlow: document.fonts.check('400 15px Barlow'),
      },
      motion: {
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scrolling: getComputedStyle(document.documentElement).scrollBehavior,
      },
      targets: Array.from(
        document.querySelectorAll<HTMLElement>('a[href],button,summary,input,select,textarea'),
      )
        .filter(
          (element) =>
            element.getClientRects().length &&
            getComputedStyle(element).visibility !== 'hidden' &&
            !element.closest('details:not([open]) > :not(summary)'),
        )
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            name: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 160),
            width: rect.width,
            height: rect.height,
            disabled: element.matches(':disabled'),
          };
        }),
      tables: Array.from(document.querySelectorAll('table')).map((table) => ({
        width: table.getBoundingClientRect().width,
        containerWidth: table.parentElement?.clientWidth,
        overflow: table.parentElement ? getComputedStyle(table.parentElement).overflowX : null,
      })),
      textRoles: textElements.map((element) => {
        const style = getComputedStyle(element);
        const editable =
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement;
        const placeholder = editable && !element.value && !!element.placeholder;
        const text = editable
          ? placeholder
            ? element.placeholder
            : element.value
              ? '[editable text; value private]'
              : ''
          : element instanceof HTMLSelectElement
            ? element.selectedOptions[0]?.text
            : directText(element);
        const svg = element instanceof SVGTextContentElement;
        const ground = paint(element);
        return {
          ...ground,
          opacity: ground.opacity * (svg ? Number(style.fillOpacity) : 1),
          tag: element.tagName,
          className: element.getAttribute('class') ?? '',
          text: text?.slice(0, 100),
          color: svg
            ? style.fill
            : placeholder
              ? getComputedStyle(element, '::placeholder').color
              : style.color,
          ...(svg && style.stroke !== 'none' && parseFloat(style.strokeWidth) > 0
            ? {
                paintLimitation:
                  'SVG glyph stroke/fill edge composition requires manual assessment; CSS color is not glyph paint',
              }
            : {}),
          placeholder,
          fontSize: style.fontSize,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
        };
      }),
      boundaries: Array.from(
        document.querySelectorAll<HTMLElement>('.field input,.field select,#ask-draft,.ask__box'),
      )
        .filter(
          (element) =>
            element.getClientRects().length &&
            !element.closest('details:not([open]) > :not(summary)') &&
            parseFloat(getComputedStyle(element).borderTopWidth) > 0,
        )
        .map((element) => ({
          ...paint(element, element.parentElement),
          foreground: getComputedStyle(element).borderTopColor,
        })),
    };
  }, describePaint.toString());
  return {
    ...measured,
    paintSettle: {
      pendingTransitions,
      elapsedMilliseconds: Date.now() - startedAt,
      method: 'Bounded observation of genuine CSS transition completion; no animation mutation',
    },
  };
}

/** Full Chromium settings changes real browser zoom, with independently measured product geometry. */
export async function setNativeZoom(
  context: BrowserContext,
  product: Page,
  base: string,
  factor: '1' | '2',
) {
  const before = await product.evaluate(() => ({
    dpr: devicePixelRatio,
    width: innerWidth,
    font: getComputedStyle(document.body).fontSize,
  }));
  const settings = await context.newPage();
  try {
    await settings.goto('chrome://settings/appearance');
    await settings.locator('#zoomLevel').selectOption(factor);
    const selected = await settings.locator('#zoomLevel').inputValue();
    await product.goto(base);
    const after = await product.evaluate(() => ({
      dpr: devicePixelRatio,
      width: innerWidth,
      font: getComputedStyle(document.body).fontSize,
    }));
    return { selected, before, after, mechanism: 'chrome://settings/appearance #zoomLevel' };
  } finally {
    await settings.close();
  }
}
