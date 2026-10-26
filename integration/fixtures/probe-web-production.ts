import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, errors } from 'playwright';

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
let admissions = 0;
let confirmations = 0;
let runId: string | null = null;
let terminalStatus: 'uninterrupted' | 'recovered' | null = null;
let initialTerminalFailure: {
  at: string;
  name: string;
  message: string;
  screenshot: string;
  runId: string;
  text: string;
} | null = null;
let recovery: {
  visibleAt: string;
  screenshot: string;
  runId: string;
  retriedAt: string | null;
  completedAt: string | null;
} | null = null;
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
    admissions++;
    await route.continue({
      headers: {
        ...route.request().headers(),
        traceparent: `00-${traceId}-${randomBytes(8).toString('hex')}-01`,
      },
    });
  } else {
    if (
      route.request().method() === 'POST' &&
      /\/api\/v1\/runs\/[^/]+\/confirm$/.test(url.pathname)
    )
      confirmations++;
    await route.continue();
  }
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
      runId = await page.locator('.ask-live .ask-identifiers dd').first().textContent();
      if (!runId) throw new Error('Admitted run identity is absent.');
      await writeFile(
        `${directory}/${phase}-pending.json`,
        JSON.stringify({ startedAt, revision, phase, traceId, runId, state: 'admitted' }, null, 2),
        { mode: 0o600 },
      );
      if (phase === 'confirm') {
        await page
          .locator('.ask-live')
          .getByText('Is the proposed intent “Listing search”?', { exact: true })
          .waitFor();
        await page
          .getByRole('button', { name: 'Confirm proposal and values', exact: true })
          .waitFor();
        await page.screenshot({ path: `${directory}/confirm-awaiting.png`, fullPage: true });
        await page
          .getByRole('button', { name: 'Confirm proposal and values', exact: true })
          .click();
      }
      const completed = page
        .locator('.ask-live .ask-record__head .st')
        .filter({ hasText: /^Completed$/ });
      try {
        await completed.waitFor();
        terminalStatus = 'uninterrupted';
      } catch (error) {
        if (phase !== 'ask' || !(error instanceof errors.TimeoutError)) throw error;
        initialTerminalFailure = {
          at: new Date().toISOString(),
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
          screenshot: `${directory}/ask-initial-terminal-failed.png`,
          runId,
          text: await page.locator('.ask-live').innerText(),
        };
        await page.screenshot({ path: initialTerminalFailure.screenshot, fullPage: true });
        await writeFile(
          `${directory}/ask-initial-terminal-failed.json`,
          JSON.stringify(
            { result: 'failed', revision, phase, traceId, ...initialTerminalFailure },
            null,
            2,
          ),
          { mode: 0o600 },
        );
        const interruption = page
          .locator('.ask-live .system-error')
          .filter({
            hasText:
              'Communication was interrupted or refused. This does not confirm the end of the run.',
          })
          .filter({
            hasText: 'Try resuming evidence for this same run. No new question will be submitted.',
          });
        await interruption.waitFor();
        if ((await page.locator('.ask-live .ask-identifiers dd').first().textContent()) !== runId)
          throw new Error('Run identity changed before explicit recovery.', { cause: error });
        recovery = {
          visibleAt: new Date().toISOString(),
          screenshot: `${directory}/ask-recovery.png`,
          runId,
          retriedAt: null,
          completedAt: null,
        };
        await page.screenshot({ path: recovery.screenshot, fullPage: true });
        recovery.retriedAt = new Date().toISOString();
        await interruption.getByRole('button', { name: 'Try again', exact: true }).click();
        if ((await page.locator('.ask-live .ask-identifiers dd').first().textContent()) !== runId)
          throw new Error('Run identity changed after explicit recovery.', { cause: error });
        await completed.waitFor();
        recovery.completedAt = new Date().toISOString();
        terminalStatus = 'recovered';
      }
      if ((await page.locator('.ask-live .ask-identifiers dd').first().textContent()) !== runId)
        throw new Error('Terminal belongs to a different admitted run.');
      if (admissions !== 1 || confirmations !== (phase === 'confirm' ? 1 : 0))
        throw new Error('Journey issued an unexpected admission or confirmation mutation.');
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
      } else {
        // Confirmed non-price execution-unavailable evidence maps to completed/not_available.
        await page
          .locator('.ask-live')
          .getByText('The recognized intent is unavailable.', { exact: true })
          .waitFor();
        await page
          .locator('.ask-live')
          .getByText('Proposed intent in this record: Listing search.', { exact: true })
          .waitFor();
        await page.locator('.ask-live .ask-recorded-confirmation').waitFor();
        await page
          .locator('.ask-live')
          .getByText('No model explanation was returned for this state.', { exact: true })
          .waitFor();
        if (await page.locator('.ask-live .fig__value').count())
          throw new Error('Unavailable listing_search completion unexpectedly presents a price.');
        if (
          await page
            .locator('.ask-live')
            .getByText('Explanation, written by a model', { exact: true })
            .count()
        )
          throw new Error(
            'Unavailable listing_search completion unexpectedly presents model prose.',
          );
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
        const source = await page.locator('.place-median .prov__sources a').getAttribute('href');
        if (
          sources !== 1 ||
          source !== 'https://aurora.synthetic.invalid/listings/AUR-BV-001' ||
          !/2026/.test(evidence)
        )
          throw new Error(
            'Visible median lacks its canonical Aurora evidence or computation date.',
          );
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
        runId,
        terminalStatus,
        initialTerminalFailure,
        recovery,
        admissions,
        confirmations,
        ...(phase === 'confirm'
          ? {
              expectedTerminal: { state: 'completed', reason: null },
              expectedResult: {
                kind: 'unavailable_intent',
                intent: 'listing_search',
                reason: 'not_available',
              },
            }
          : {}),
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
      runId,
      terminalStatus,
      initialTerminalFailure: initialTerminalFailure !== null,
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
        runId,
        terminalStatus,
        initialTerminalFailure,
        recovery,
        admissions,
        confirmations,
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
