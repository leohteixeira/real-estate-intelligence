import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  parseEnabledSourcesResponse,
  parsePropertyResponse,
  parseSearchResponse,
} from '../../packages/contracts/dist/index.js';

const [directory, revision, phase] = process.argv.slice(2);
if (!directory || !revision || !/^[a-f0-9]{40}$/.test(revision))
  throw new Error('Supply an evidence directory and full delivered revision.');
if (!['search', 'listing', 'privacy', 'recovery'].includes(phase ?? ''))
  throw new Error('Select one bounded public journey.');
await mkdir(directory, { recursive: true, mode: 0o700 });
const base = 'https://leohteixeira.com/real-estate-intelligence';
const startedAt = new Date().toISOString();
const searchOrders: Array<{
  lang: string;
  width: number;
  ids: string[];
  minorUnits: Array<number | null>;
}> = [];
const browserEnvironment = { ...process.env };
delete browserEnvironment.DISPLAY;
const browser = await chromium.launch({
  executablePath: chromium.executablePath(),
  chromiumSandbox: true,
  env: browserEnvironment,
  args: [
    '--ozone-platform=headless',
    '--disable-vulkan-surface',
    '--use-gl=angle',
    '--use-angle=swiftshader-webgl',
  ],
  ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1142 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
page.setDefaultTimeout(15000);
const network: Array<{ path: string; status: number; method: string }> = [];
const captures: Array<{ name: string; path: string; text: string }> = [];
const pageErrors: string[] = [];
const escaped: string[] = [];
let writes = 0;
let interruptPreparedRead = false;
const interruptedReads: string[] = [];
page.on('pageerror', (error) => pageErrors.push(error.name));
page.on('response', (response) =>
  network.push({
    path: new URL(response.url()).pathname,
    status: response.status(),
    method: response.request().method(),
  }),
);
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (
    url.origin !== 'https://leohteixeira.com' ||
    !url.pathname.startsWith('/real-estate-intelligence/')
  ) {
    escaped.push(url.origin + url.pathname);
    await route.abort();
  } else {
    if (interruptPreparedRead && url.pathname.endsWith('/api/v1/ask/fixtures')) {
      interruptedReads.push(url.pathname);
      await route.abort('internetdisconnected');
      return;
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) writes++;
    await route.continue();
  }
});
async function locale(value: 'en' | 'pt-BR') {
  await page
    .getByRole('button', { name: value === 'en' ? 'English' : 'Português', exact: true })
    .filter({ visible: true })
    .first()
    .click();
}
async function capture(name: string) {
  await page.evaluate(() => document.fonts.ready);
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error('Public journey has horizontal page overflow.');
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
  captures.push({
    name,
    path: new URL(page.url()).pathname + new URL(page.url()).search,
    text: await page.locator('main').innerText(),
  });
}
try {
  if (phase === 'search') {
    for (const lang of ['en', 'pt-BR'] as const) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1142 });
        await page.goto(`${base}/search/sao-paulo`);
        await page.locator('.search-rows > li').nth(4).waitFor();
        await locale(lang);
        if ((await page.locator('.search-rows > li').count()) !== 5)
          throw new Error('The synthetic city must contain five resolved properties.');
        await page.locator('#search-sort').selectOption('lowest-price-per-square-meter');
        await page.waitForURL(
          (url) => url.searchParams.get('sort') === 'lowest-price-per-square-meter',
        );
        await page.locator('.search-rows > li').nth(4).waitFor();
        const response = await page.request.get(
          `${base}/api/v1/properties?placeId=sao-paulo&sort=lowest-price-per-square-meter`,
        );
        if (response.status() !== 200) throw new Error('Actual sorted search is unavailable.');
        const body: unknown = await response.json();
        const expected = parseSearchResponse(body);
        if (expected.items.length !== 5 || expected.totalItems !== 5)
          throw new Error('Expected five synthetic search results.');
        for (let index = 1; index < expected.items.length; index++) {
          const before = expected.items[index - 1]!.pricePerSquareMeter;
          const after = expected.items[index]!.pricePerSquareMeter;
          if (before !== null && after !== null && before > after)
            throw new Error('Backend search violates ascending price per area.');
        }
        await page.waitForFunction(
          (ids) => {
            const links = [...document.querySelectorAll('.search-rows > li a.prow')];
            return (
              links.length === ids.length &&
              links.every((link, index) =>
                link.getAttribute('href')?.includes(`/properties/${ids[index]}?returnTo=`),
              )
            );
          },
          expected.items.map((item) => item.id),
        );
        searchOrders.push({
          lang,
          width,
          ids: expected.items.map((item) => item.id),
          minorUnits: expected.items.map((item) => item.pricePerSquareMeter),
        });
        await page.locator('#search-filters-link').click();
        await page.locator('#minAskingPrice').fill('2');
        await page.locator('#maxAskingPrice').fill('1');
        await page.locator('#draft-error').waitFor();
        if ((await page.locator('#maxAskingPrice').getAttribute('aria-invalid')) !== 'true')
          throw new Error('Reversed range must be visibly invalid.');
        await capture(`invalid-${lang}-${width}`);
        await page.locator('#minAskingPrice').fill('');
        const show = page.getByRole('button', {
          name: lang === 'en' ? 'Show 0 properties' : 'Mostrar 0 imóveis',
          exact: true,
        });
        await show.waitFor();
        await show.click();
        const relax = page.getByRole('button', {
          name: lang === 'en' ? 'Relax Asking price (R$)' : 'Relaxar Preço pedido (R$)',
          exact: true,
        });
        await relax.waitFor();
        if ((await page.locator('.search-rows > li').count()) !== 0)
          throw new Error('A one-real maximum must exclude all synthetic asking prices.');
        await capture(`empty-${lang}-${width}`);
        await relax.click();
        await page.locator('.search-rows > li').nth(4).waitFor();
        if (new URL(page.url()).searchParams.has('maxAskingPrice'))
          throw new Error('Relax action retained the responsible price bound.');
        await capture(`restored-${lang}-${width}`);
        await page.reload();
        await page.locator('.search-rows > li').nth(4).waitFor();
      }
    }
  } else if (phase === 'listing') {
    const response = await page.request.get(
      `${base}/api/v1/properties/01a179c6-fc86-7a92-b01f-6b4ebf11623d`,
    );
    if (response.status() !== 200) throw new Error('Grouped synthetic property is unavailable.');
    const body: unknown = await response.json();
    const property = parsePropertyResponse(body).property;
    const aurora = property.listings.find((item) => item.source.sourceListingId === 'AUR-BV-001');
    if (!aurora || property.listings.length !== 3 || aurora.description.permission !== 'allowed')
      throw new Error('Expected the catalogued three-source group.');
    for (const lang of ['en', 'pt-BR'] as const) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1142 });
        await page.goto(`${base}/listings/${aurora.id}`);
        await page.locator('.listing-values').waitFor();
        await locale(lang);
        const asking = await page
          .locator('.listing-values tbody tr')
          .first()
          .locator('td')
          .first()
          .innerText();
        if (asking.replace(/\D/g, '') !== '78000000')
          throw new Error('Aurora asking price differs from catalogued 780000 BRL.');
        await page.locator('.listing-provenance details > summary').click();
        const identifiers = await page
          .locator('.listing-provenance .listing-identifiers')
          .innerText();
        if (!identifiers.includes('AUR-BV-001') || !/sha256:[a-f0-9]{64}/.test(identifiers))
          throw new Error('Original source identity or snapshot hash is absent.');
        await page.locator('.listing-comparison > summary').click();
        if (
          (await page.locator('.listing-description-text').first().innerText()) !==
          aurora.description.current
        )
          throw new Error('Permitted description differs from returned source evidence.');
        await page.locator('.listing-effective-times > summary').click();
        if ((await page.locator('.listing-effective-times dd time').count()) !== 8)
          throw new Error('Complete field-effective dates are absent.');
        await capture(`listing-${lang}-${width}`);
        await page.reload();
        await page.locator('.listing-values').waitFor();
        await page
          .getByRole('link', {
            name: lang === 'en' ? 'Back to Property' : 'Voltar ao imóvel',
            exact: true,
          })
          .click();
        await page.locator('.property-source-disclosure').nth(2).waitFor();
      }
    }
  } else if (phase === 'privacy') {
    const response = await page.request.get(`${base}/api/v1/collection/sources`);
    if (response.status() !== 200) throw new Error('Enabled-source register is unavailable.');
    const body: unknown = await response.json();
    const register = parseEnabledSourcesResponse(body);
    if (
      register.sources.length !== 4 ||
      !register.sources.some((source) => source.sourceId === 'synthetic-data')
    )
      throw new Error('Expected baseline synthetic source and three synthetic portals.');
    await writeFile(`${directory}/enabled-sources.json`, JSON.stringify(register, null, 2), {
      mode: 0o600,
    });
    for (const lang of ['en', 'pt-BR'] as const) {
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1142 });
        await page.goto(`${base}/privacy`);
        await page.locator('.privacy-source').nth(2).waitFor();
        await locale(lang);
        const sources = await page.locator('.privacy-sources').innerText();
        for (const source of register.sources)
          if (!sources.includes(source.sourceId))
            throw new Error('Enabled synthetic-source attribution is absent.');
        if (
          (await page.locator('.privacy-source').count()) !== register.sources.length ||
          (await page.locator('.privacy-permissions dd').count()) !== register.sources.length * 3
        )
          throw new Error('Privacy must expose every enabled source and independent permissions.');
        if (await page.locator('a[href^="mailto:"]').count())
          throw new Error('This release must not invent an unconfigured privacy contact.');
        await capture(`privacy-${lang}-${width}`);
      }
    }
  } else {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/ask/sao-paulo-bela-vista`);
    await page.locator('#ask-draft').waitFor();
    await locale('en');
    const draft = 'Synthetic final campaign draft; do not submit.';
    await page.locator('#ask-draft').fill(draft);
    interruptPreparedRead = true;
    await page.getByRole('button', { name: 'Follow the prepared example', exact: true }).click();
    await page.locator('.ask-screen .system-error').waitFor();
    await capture('offline-en-390');
    await locale('pt-BR');
    await capture('offline-pt-BR-390');
    if ((await page.locator('#ask-draft').inputValue()) !== draft)
      throw new Error('Transient read failure lost the unsent draft.');
    interruptPreparedRead = false;
    await locale('en');
    await page
      .locator('.ask-screen .system-error')
      .getByRole('button', { name: 'Try again', exact: true })
      .click();
    await page
      .locator('.ask-session-status')
      .filter({ hasText: /^Completed/ })
      .waitFor();
    if ((await page.locator('#ask-draft').inputValue()) !== draft)
      throw new Error('Explicit prepared-read recovery lost the unsent draft.');
    await capture('recovered-en-390');
    await locale('pt-BR');
    await capture('recovered-pt-BR-390');
  }
  if (writes || escaped.length || pageErrors.length || network.some((item) => item.status >= 400))
    throw new Error(
      'Read journey issued a write, escaped request, page error or failed HTTP response.',
    );
  await writeFile(
    `${directory}/${phase}.json`,
    JSON.stringify(
      {
        result: 'passed',
        revision,
        phase,
        startedAt,
        completedAt: new Date().toISOString(),
        writes,
        interruptedReads,
        searchOrders,
        captures,
        network,
        escaped,
        pageErrors,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ result: 'passed', phase, captures: captures.length, directory }));
} catch (error) {
  await context.setOffline(false);
  await page.screenshot({ path: `${directory}/${phase}-failed.png`, fullPage: true });
  await writeFile(
    `${directory}/${phase}-failed.json`,
    JSON.stringify(
      {
        result: 'failed',
        revision,
        phase,
        startedAt,
        completedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : String(error),
        writes,
        interruptedReads,
        searchOrders,
        captures,
        network,
        escaped,
        pageErrors,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}
