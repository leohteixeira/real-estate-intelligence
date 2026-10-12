import type { Page } from 'playwright';
import { expect } from 'vitest';
import { parsePlaceMarketResponse } from '../../packages/contracts/dist/index.js';
import { requestHttp } from './http.ts';
import { checkAccessibility } from './accessibility.ts';

/** Force transport conditions only; each manual retry returns to the owned real API. */
export async function exerciseSystemStateReads(
  page: Page,
  base: string,
  width: number,
  locale: 'pt-BR' | 'en',
  captures: URL,
) {
  const id = 'sao-paulo-bela-vista';
  const url = `${base}/places/${id}?owned-filter=retained`;
  const marketUrl = `${base}/api/v1/places/${id}/market`;
  const figure = locale === 'en' ? 'R$ 9,515 /m²' : 'R$ 9.515 /m²';
  const retry = locale === 'en' ? 'Try again' : 'Tentar de novo';
  const read = await requestHttp(marketUrl);
  expect(read.status).toBe(200);
  const market = parsePlaceMarketResponse(await read.json());
  // The owned event-fed median is explicitly untracked. A stale condition belongs
  // in the labelled gallery, not a fabricated response that violates this contract.
  expect(market.figures.medianAskingPricePerSquareMeter.freshness.status).toBe('untracked');
  const requestId = read.headers.get('x-request-id');
  expect(requestId).toMatch(/^[0-9a-f-]{36}$/i);
  const capture = async (condition: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await checkAccessibility(page, `system-read-${condition}-${width}-${locale}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: new URL(`system-read-${condition}-${width}-${locale}.png`, captures).pathname,
      fullPage: true,
    });
  };
  for (const publicId of [requestId, null]) {
    let attempts = 0;
    await page.route(marketUrl, async (route) => {
      attempts++;
      if (attempts === 1)
        await route.fulfill({
          status: 503,
          body: 'private constructed transport payload',
          headers: publicId ? { 'x-request-id': publicId } : {},
        });
      else await route.continue();
    });
    try {
      await page.goto(url);
      await expect.poll(() => page.locator('.system-error').count()).toBe(1);
      expect(await page.getByRole('heading', { name: 'Bela Vista', exact: true }).isVisible()).toBe(
        true,
      );
      expect(await page.locator('.system-error__reference').count()).toBe(publicId ? 1 : 0);
      if (publicId)
        expect(await page.locator('.system-error__reference').textContent()).toContain(publicId);
      expect(await page.locator('body').textContent()).not.toContain(
        'private constructed transport payload',
      );
      expect(attempts).toBe(1);
      await capture(publicId ? 'failure-id' : 'failure-no-id');
      const button = page.getByRole('button', { name: retry, exact: true });
      await button.focus();
      expect(await button.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
      expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await page.keyboard.press('Enter');
      await expect.poll(() => page.locator('.place-median .fig__value').textContent()).toBe(figure);
      expect(page.url()).toBe(url);
      expect(attempts).toBe(2);
    } finally {
      await page.unroute(marketUrl);
    }
  }
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let began = false;
  await page.route(marketUrl, async (route) => {
    began = true;
    await blocked;
    await route.continue();
  });
  try {
    await page.goto(url);
    await expect.poll(() => began).toBe(true);
    expect(await page.getByRole('heading', { name: 'Bela Vista', exact: true }).isVisible()).toBe(
      true,
    );
    expect(await page.locator('.place-median .system-loading [role="status"]').textContent()).toBe(
      locale === 'en' ? 'Loading median…' : 'Carregando mediana…',
    );
    await capture('loading');
    release?.();
    await expect.poll(() => page.locator('.place-median .fig__value').textContent()).toBe(figure);
  } finally {
    release?.();
    await page.unroute(marketUrl);
  }
  const detailUrl = `${base}/api/v1/places/${id}`;
  let releaseDetail: (() => void) | undefined;
  const detailGate = new Promise<void>((resolve) => {
    releaseDetail = resolve;
  });
  let detailPending = false;
  const cancelled: string[] = [];
  page.on('requestfailed', (request) => {
    if (request.url() === detailUrl) cancelled.push(request.failure()?.errorText ?? 'unknown');
  });
  await page.route(detailUrl, async (route) => {
    detailPending = true;
    await detailGate;
    await route.continue();
  });
  try {
    await page.goto(url);
    await expect.poll(() => detailPending).toBe(true);
    await expect
      .poll(() => page.getByRole('heading', { name: 'Bela Vista', exact: true }).count())
      .toBe(1);
    expect(await page.locator('.system-loading [role="status"]').textContent()).toBe(
      locale === 'en' ? 'Loading place…' : 'Carregando lugar…',
    );
    await capture('known-place-loading');
    await page
      .locator('.place-navigation')
      .getByRole('link', { name: 'Pinheiros', exact: true })
      .click();
    await expect
      .poll(() => page.getByRole('heading', { name: 'Pinheiros', exact: true }).count())
      .toBe(1);
    releaseDetail?.();
    await expect.poll(() => cancelled).toContain('net::ERR_ABORTED');
    expect(await page.getByRole('heading', { name: 'Bela Vista', exact: true }).count()).toBe(0);
    expect(page.url()).toBe(`${base}/places/sao-paulo-pinheiros`);
  } finally {
    releaseDetail?.();
    await page.unroute(detailUrl);
  }
  // Expire only the browser cache clock; the API and its computation time stay real.
  await page.goto(url);
  await expect.poll(() => page.locator('.place-median .fig__value').textContent()).toBe(figure);
  await page.clock.install();
  await page.clock.fastForward(31000);
  let failedRefresh = false;
  await page.route(marketUrl, async (route) => {
    failedRefresh = true;
    await route.fulfill({ status: 503, body: 'private refresh body' });
  });
  try {
    const navigation = page.locator(width === 390 ? '.public-tabs' : '.public-rail-navigation');
    await navigation
      .getByRole('link', { name: locale === 'en' ? 'Search' : 'Buscar', exact: true })
      .click();
    await navigation
      .getByRole('link', { name: locale === 'en' ? 'Places' : 'Lugares', exact: true })
      .click();
    await expect.poll(() => failedRefresh).toBe(true);
    await expect.poll(() => page.locator('.system-error').count()).toBe(1);
    expect(await page.locator('.place-median .fig__value').textContent()).toBe(figure);
    expect(await page.getByRole('heading', { name: 'Bela Vista', exact: true }).isVisible()).toBe(
      true,
    );
    await capture('retained');
    await page.unroute(marketUrl);
    await page.getByRole('button', { name: retry, exact: true }).click();
    await expect.poll(() => page.locator('.system-error').count()).toBe(0);
    expect(await page.locator('.place-median .fig__value').textContent()).toBe(figure);
  } finally {
    await page.unroute(marketUrl);
    await page.clock.resume();
  }
}
