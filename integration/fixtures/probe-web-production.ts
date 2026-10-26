import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [directory, revision, phase] = process.argv.slice(2);
if (!directory || !revision || !/^[a-f0-9]{40}$/.test(revision))
  throw new Error('Supply a protected evidence directory and full delivered revision.');
if (phase !== 'read' && phase !== 'ask' && phase !== 'confirm')
  throw new Error('Select read, ask or confirm; each mutation phase runs exactly once.');
await mkdir(directory, { recursive: true, mode: 0o700 });
const base = 'https://leohteixeira.com/real-estate-intelligence';
const place = 'sao-paulo-bela-vista';
const property = '01a179c6-fc86-7a92-b01f-6b4ebf11623d';
const startedAt = new Date().toISOString();
const traceId = randomBytes(16).toString('hex');
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
const network: Array<{ path: string; status: number; requestId: string | undefined }> = [];
const escaped: string[] = [];
const pageErrors: string[] = [];
const captures: Array<{ name: string; path: string; text: string; overflow: boolean }> = [];
page.on('pageerror', (error) => pageErrors.push(error.name));
page.on('response', (response) => {
  const url = new URL(response.url());
  network.push({
    path: url.pathname,
    status: response.status(),
    requestId: response.headers()['x-request-id'],
  });
});
await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (
    url.origin !== 'https://leohteixeira.com' ||
    !url.pathname.startsWith('/real-estate-intelligence/')
  ) {
    escaped.push(url.origin + url.pathname);
    await route.abort();
  } else if (route.request().method() === 'POST' && url.pathname.endsWith('/api/v1/runs')) {
    await route.continue({
      headers: {
        ...route.request().headers(),
        traceparent: `00-${traceId}-${randomBytes(8).toString('hex')}-01`,
      },
    });
  } else await route.continue();
});
try {
  await page.goto(`${base}/${phase === 'read' ? 'places' : 'ask'}/${place}`);
  await page.locator('.plate__name').waitFor();
  for (const locale of phase === 'read' ? ['pt-BR', 'en'] : ['en']) {
    await page
      .getByRole('button', { name: locale === 'en' ? 'English' : 'Português', exact: true })
      .filter({ visible: true })
      .first()
      .click();
    if (phase !== 'read') {
      const question =
        phase === 'ask'
          ? 'Calculate price per square meter for BRL 785,000 and 68 square meters.'
          : 'Search and compare properties.';
      await writeFile(
        `${directory}/${phase}-pending.json`,
        JSON.stringify(
          { startedAt, revision, phase, traceId, question, state: 'before-submit' },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      await page.locator('#ask-draft').fill(question);
      await page.getByRole('button', { name: 'Submit question', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.locator('.ask-live .ask-record').waitFor();
      const runId = await page.locator('.ask-live .ask-identifiers dd').first().textContent();
      await writeFile(
        `${directory}/${phase}-pending.json`,
        JSON.stringify({ startedAt, revision, phase, traceId, runId, state: 'admitted' }, null, 2),
        { mode: 0o600 },
      );
      if (phase === 'confirm') {
        await page
          .getByRole('button', { name: 'Confirm proposal and values', exact: true })
          .waitFor();
        await page.screenshot({ path: `${directory}/confirm-awaiting.png`, fullPage: true });
        await page
          .getByRole('button', { name: 'Confirm proposal and values', exact: true })
          .click();
      }
      await page
        .locator('.ask-live .ask-record__head .st')
        .filter({ hasText: /^Completed$/ })
        .waitFor();
      if (phase === 'ask') {
        const value = await page.locator('.ask-live .fig__value').textContent();
        if (!value?.includes('11,544.12'))
          throw new Error('Visible deterministic price differs from independent 785000/68 result.');
        const explanation = await page.locator('.ask-live .ask-explanation').textContent();
        if (
          !explanation?.includes('Explanation, written by a model') ||
          !explanation.includes('vercel-ai-gateway')
        )
          throw new Error('Accepted real model explanation/provenance is absent.');
      }
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1142 });
      if (phase === 'read') {
        await page.goto(`${base}/places/${place}`);
        await page.locator('.place-median .fig__value').waitFor();
        const median = await page.locator('.place-median .fig__value').innerText();
        if (!median.replace(/[^0-9]/g, '').startsWith('9512'))
          throw new Error(
            'Visible asking median differs from the accepted 951220 minor-units result.',
          );
        await page.locator('.place-median .place-figure-evidence > summary').click();
        await page.locator('.place-median .place-provenance').waitFor({ state: 'visible' });
        const sources = await page.locator('.place-median .prov__sources a').count();
        const evidence = await page.locator('.place-median .place-provenance').innerText();
        if (sources !== 3 || !/2026/.test(evidence))
          throw new Error('Visible median lacks three source links or its computation date.');
        const counts = await page.locator('.place-counts').innerText();
        if (!/1/.test(counts) || !/3/.test(counts))
          throw new Error('Resolved property/listing/source counts are absent.');
      }
      await page.evaluate(() => document.fonts.ready);
      const name = `${phase}-${locale}-${width}`;
      const text = await page.locator(phase === 'read' ? '.place-median' : '.ask-live').innerText();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
      captures.push({ name, path: new URL(page.url()).pathname, text, overflow });
      if (phase !== 'read') {
        await page
          .getByRole('button', { name: 'Português', exact: true })
          .filter({ visible: true })
          .first()
          .click();
        const translated = await page.locator('.ask-live').innerText();
        if (!translated.includes('Execução ao vivo') || !translated.includes('Concluída'))
          throw new Error('Actual terminal lacks Portuguese presentation.');
        await page.screenshot({ path: `${directory}/${phase}-pt-BR-${width}.png`, fullPage: true });
        captures.push({
          name: `${phase}-pt-BR-${width}`,
          path: new URL(page.url()).pathname,
          text: translated,
          overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        });
        await page
          .getByRole('button', { name: 'English', exact: true })
          .filter({ visible: true })
          .first()
          .click();
      }
      if (overflow) throw new Error('Public journey has horizontal page overflow.');
      if (phase === 'read') {
        await page.goto(`${base}/properties/${property}`);
        await page.locator('.property-source-disclosure').nth(2).waitFor();
        if ((await page.locator('.property-source-disclosure').count()) !== 3)
          throw new Error('Resolved property does not expose exactly three listing disclosures.');
        for (const disclosure of await page.locator('.property-source-disclosure').all())
          await disclosure.locator(':scope > summary').click();
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
          throw new Error('Property provenance has horizontal page overflow.');
        await page.screenshot({
          path: `${directory}/property-${locale}-${width}.png`,
          fullPage: true,
        });
        await page.reload();
        await page.locator('.property-source-disclosure').nth(2).waitFor();
      }
    }
  }
  if (
    escaped.length ||
    pageErrors.length ||
    captures.some((item) => item.overflow) ||
    network.some((item) => item.status >= 400)
  )
    throw new Error(
      'Public browser observed an escaped request, page error or failed HTTP response.',
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
        traceId,
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
  console.log(
    JSON.stringify({
      result: 'passed',
      revision,
      phase,
      traceId,
      captures: captures.length,
      directory,
    }),
  );
} catch (error) {
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
        traceId,
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
