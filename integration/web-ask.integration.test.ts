import { randomUUID, createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium, type Browser } from 'playwright';
import { expect, test } from 'vitest';
import {
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseAskRun,
  parseAskThread,
} from '../packages/contracts/dist/index.js';
import { DatabaseConnection } from '../packages/infrastructure/dist/index.js';
import { allocatePorts, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import {
  askDatabaseState,
  askDockerInventory,
  askOracleFrames,
  askVersion,
  captureAskSurface,
  type AskSurface,
} from './support/ask-web-evidence.ts';
import { copySurfaceEvidence } from './support/search-campaign.ts';
import { runAskCampaign } from './support/ask-campaign.ts';
import { runAskAttempt } from './support/ask-attempt.ts';
import { settlePropertyCaptureStart } from './support/property-capture.ts';
import { preparedPropertyId } from './support/property-reads.ts';

const scenarios = [
  [
    'ASK-001',
    'Prepared finite run and actual history',
    'The independently parsed owned API queued fixture.',
    'Explicitly follow its real stream and inspect each actual thread member.',
    'Exact backend inputs, result, timestamps and steps agree; origin, geography and missing model/citations stay honest.',
  ],
  [
    'ASK-002',
    'Private unsent draft handoffs',
    'Overview and Property native Ask links.',
    'Edit the draft and follow the separate example, then change locale and place.',
    'No execution/write, question URL/storage/diagnostics or place laundering; draft survives example and locale.',
  ],
  [
    'ASK-003',
    'Read refusal and manual recovery',
    'A bounded transport-only 503, 404 or malformed response.',
    'Explicitly follow, inspect the sanitized error, then retry the real API.',
    'No automatic ordinary retry or private body disclosure; recovery is genuine.',
  ],
  [
    'ASK-004',
    'Interrupted SSE cursor and corruption',
    'Actual finite SSE bytes with a transport disconnect or truncation.',
    'Reconnect once with the same authority and exact admitted cursor, then manually recover a corrupt read.',
    'Validated evidence is retained, explicit terminal agrees with the oracle and fixed GET never rolls it back.',
  ],
  [
    'ASK-005',
    'Navigation abandons obsolete authority',
    'An owned example stream held before response headers.',
    'Navigate to another place before releasing the held response.',
    'The abandoned request is aborted and no old record appears in the new screen.',
  ],
  [
    'ASK-006',
    'Responsive bilingual keyboard and accessibility',
    'The completed real prepared example and local Placa fonts.',
    'Inspect PT/EN at 390, 960 and 1440; keyboard-toggle identifiers and thread.',
    'All-page axe has no violations; targets, visible focus, fonts, scroll start and overflow satisfy the screen contract.',
  ],
  [
    'ASK-007',
    'Unmodified authored references',
    'The fixed Ask and DesktopAsk authored artboards.',
    'Capture through an owned Vite reference server with local fonts.',
    'Exact 390×2034 and 1440×1142 references have source hashes for separate parent comparison.',
  ],
].map(([id, title, given, when, then]) => ({
  id: id!,
  title: title!,
  given: given!,
  when: when!,
  then: then!,
  area: 'Ask',
  persona: 'public visitor',
  dependencies: [],
  verification: {
    oracle: 'D-066/D-067 and independently parsed real prepared API',
    method:
      'Supertest, sandboxed Chromium and unchanged SQL digests; not durable/live execution proof',
  },
}));

test('Ask follows a real prepared completed run through owned HTTP, SSE and Chromium', async () => {
  const runId = `ask-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = new URL(`../apps/web/.impeccable/review/campaigns/${runId}/`, import.meta.url);
  for (const folder of ['catalog/', 'results/', 'evidence/', 'fixtures/'])
    await mkdir(new URL(folder, directory), { recursive: true });
  await writeFile(
    new URL('catalog/scenarios.json', directory),
    JSON.stringify({ scenarios }, null, 2),
  );
  await writeFile(
    new URL('catalog/ask.feature', directory),
    scenarios
      .map(
        (s) =>
          `Scenario: ${s.id} ${s.title}\n  Given ${s.given}\n  When ${s.when}\n  Then ${s.then}`,
      )
      .join('\n\n'),
  );
  const project = `rei-web-ask-${randomUUID()}`;
  const [postgres, api, web, reference] = await allocatePorts(4);
  const base = `http://127.0.0.1:${web}`,
    referenceBase = `http://127.0.0.1:${reference}`;
  const settings = {
    NODE_ENV: 'test',
    POSTGRES_DB: 'rei_web_ask',
    POSTGRES_USER: 'rei_web_ask',
    POSTGRES_PASSWORD: 'controlled-ask-fixture',
    POSTGRES_PORT: String(postgres),
    API_PORT: String(api),
    WEB_PORT: String(web),
    OTEL_EXPORTER_OTLP_ENDPOINT: '',
  };
  const fixture = new ComposeFixture(project, settings, { preparedSearch: true });
  const foreign = await askDockerInventory();
  const campaign = {
    runId,
    project,
    status: 'running',
    scope: 'D-066/D-067 prepared read-only Ask; no worker, AI or durable browser recovery',
    startedUtc: new Date().toISOString(),
    stackTornDownUtc: null as string | null,
    exclusions: [
      'Live execution, model prose/citations and persisted browser run creation',
      'Parent visual/detector/finish acceptance and human screen-reader/daylight/zoom assessment',
    ],
  };
  const manifest: AskSurface[] = [];
  let browser: Browser | undefined, connection: DatabaseConnection | undefined;
  await writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2));
  await runAskCampaign(
    async () => {
      await fixture.up(['--build', 'postgres', 'migrations', 'api', 'web']);
      const databaseURL = new URL(`postgres://127.0.0.1:${postgres}/${settings.POSTGRES_DB}`);
      databaseURL.username = settings.POSTGRES_USER;
      databaseURL.password = settings.POSTGRES_PASSWORD;
      connection = new DatabaseConnection(databaseURL.toString());
      const before = await askDatabaseState(connection);
      const version = await askVersion(project, base);
      await writeFile(new URL('version.json', directory), JSON.stringify(version, null, 2));
      const availability = parseAskAvailability(
        await (await requestHttp(`${base}/api/v1/ask/capabilities`)).json(),
      );
      const catalogue = parseAskFixtureCatalogue(
        await (await requestHttp(`${base}/api/v1/ask/fixtures`)).json(),
      );
      const example = catalogue.items.find((item) => item.state === 'queued')!;
      expect(example).toBeDefined();
      const headers = { Authorization: `Bearer ${example.grant.capability}` };
      const initial = parseAskRun(
        await (await requestHttp(`${base}/api/v1/runs/${example.runId}`, { headers })).json(),
      );
      const thread = parseAskThread(
        await (await requestHttp(`${base}/api/v1/threads/${example.threadId}`, { headers })).json(),
      );
      const stream = await (
        await requestHttp(`${base}/api/v1/runs/${example.runId}/events`, { headers })
      ).text();
      const frames = askOracleFrames(stream),
        terminal = frames.at(-1)!.run;
      expect(frames.map((frame) => frame.sequence)).toEqual([1, 2, 3]);
      expect(frames.map((frame) => frame.run.state)).toEqual(['queued', 'running', 'completed']);
      expect(terminal.terminal).toEqual({
        state: 'completed',
        at: terminal.updatedAt,
        reason: null,
      });
      expect(terminal.placeId).toBe('sao-paulo-pinheiros');
      expect(thread.runs.at(-1)).toEqual(initial);
      expect(terminal.result?.kind).toBe('price_per_square_meter');
      if (terminal.result?.kind !== 'price_per_square_meter')
        throw new Error('Actual prepared price result absent.');
      const price = terminal.result;
      await writeFile(
        new URL('fixtures/oracle.json', directory),
        JSON.stringify(
          {
            availability,
            initial,
            thread,
            frames,
            catalogue: catalogue.items.map(({ runId, threadId, state }) => ({
              runId,
              threadId,
              state,
            })),
            authority: 'Capability intentionally omitted.',
          },
          null,
          2,
        ),
      );
      const browserEnv = { ...process.env };
      delete browserEnv.DISPLAY;
      browser = await chromium.launch({
        executablePath: chromium.executablePath(),
        chromiumSandbox: true,
        env: browserEnv,
        args: [
          '--ozone-platform=headless',
          '--disable-vulkan-surface',
          '--use-gl=angle',
          '--use-angle=swiftshader-webgl',
        ],
        ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
      });
      const context = await browser.newContext({
        viewport: { width: 390, height: 2034 },
        reducedMotion: 'reduce',
      });
      await context.addInitScript(() => localStorage.setItem('rei.locale', 'pt-BR'));
      const outside: string[] = [],
        forbidden: string[] = [],
        reads: string[] = [];
      const servedAssets = new Map<string, string>();
      context.on('response', (response) => {
        if (/\/assets\/.*\.(js|css)$/.test(new URL(response.url()).pathname))
          void response
            .body()
            .then((body) =>
              servedAssets.set(
                new URL(response.url()).pathname,
                createHash('sha256').update(body).digest('hex'),
              ),
            )
            .catch(() => undefined);
      });
      await context.route('**/*', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (url.origin !== base) {
          outside.push(url.origin);
          await route.abort();
        } else if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
          forbidden.push(`${request.method()} ${url.pathname}`);
          await route.abort();
        } else {
          if (url.pathname.startsWith('/api/')) reads.push(url.pathname + url.search);
          await route.continue();
        }
      });
      const page = await context.newPage();
      let attempts = 0;
      async function attempt(id: string, action: (folder: URL) => Promise<void>) {
        const attemptId = `${id}-${++attempts}`,
          folder = new URL(`evidence/${attemptId}/`, directory),
          startedUtc = new Date().toISOString();
        await runAskAttempt(
          async () => {
            await mkdir(folder, { recursive: true });
            await action(folder);
          },
          {
            captures: [
              {
                name: 'final.png',
                run: () =>
                  page.screenshot({
                    path: new URL('final.png', folder).pathname,
                    fullPage: true,
                    mask: [page.locator('#ask-draft, .place-question input, .place-draft')],
                  }),
              },
              {
                name: 'environment.json',
                run: () =>
                  writeFile(
                    new URL('environment.json', folder),
                    JSON.stringify({ version }, null, 2),
                  ),
              },
              {
                name: 'readback.json',
                run: async () =>
                  writeFile(
                    new URL('readback.json', folder),
                    JSON.stringify(
                      {
                        url: page.url(),
                        reads,
                        outside,
                        forbidden,
                        body: await page.locator('body').evaluate((body) => {
                          const copy = body.cloneNode(true) as HTMLElement;
                          for (const draft of copy.querySelectorAll(
                            'textarea,input,.place-draft',
                          )) {
                            draft.textContent = '[Unsent draft redacted]';
                            draft.removeAttribute('value');
                          }
                          return copy.textContent?.slice(0, 20000);
                        }),
                        diagnostics:
                          'Inspect attempt status and runner output. Draft/authority excluded from diagnostic files.',
                      },
                      null,
                      2,
                    ),
                  ),
              },
            ],
            report: ({ failed, actionFailed, produced }) =>
              appendFile(
                new URL('results/attempts.jsonl', directory),
                JSON.stringify({
                  attemptId,
                  scenarioId: id,
                  status: failed ? 'failed' : 'approved',
                  executorError: false,
                  startedUtc,
                  finishedUtc: new Date().toISOString(),
                  reason: failed
                    ? 'Work or required evidence failed; inspect runner output. Not automatically executor-only.'
                    : 'All declared independent real API/native browser checks passed.',
                  verification: {
                    expected: scenarios.find((s) => s.id === id)?.then,
                    observed: actionFailed
                      ? 'Failed work'
                      : failed
                        ? 'Required evidence failed'
                        : 'Declared checks passed',
                  },
                  environmentEvidence: produced.includes('environment.json')
                    ? `evidence/${attemptId}/environment.json`
                    : null,
                  finalUiEvidence: produced.includes('final.png')
                    ? `evidence/${attemptId}/final.png`
                    : null,
                  evidence: produced
                    .filter((name) => name === 'readback.json')
                    .map((name) => `evidence/${attemptId}/${name}`),
                }) + '\n',
              ),
          },
        );
      }
      const follow = () =>
        page
          .getByRole('button', {
            name: /Acompanhar o exemplo preparado|Follow the prepared example/,
          })
          .click();
      async function completed(locale: 'pt-BR' | 'en') {
        const money = (minor: number) =>
          new Intl.NumberFormat(locale === 'en' ? 'en-US' : locale, {
            style: 'currency',
            currency: price.currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
            .format(minor / 100)
            .replace(/\u00a0/g, ' ')
            .replace(/^R\$\s*/, 'R$ ');
        await expect
          .poll(() => page.locator('.ask-record .fig__value').textContent())
          .toContain(money(price.minorUnits));
        expect(await page.locator('.ask-record').textContent()).toContain(terminal.question);
        expect(await page.locator('.ask-record').textContent()).toContain(
          money(price.inputs.priceMinorUnits),
        );
        expect(await page.locator('.ask-record .fig > .small').textContent()).toBe(
          `${money(price.inputs.priceMinorUnits)} ÷ ${new Intl.NumberFormat(locale).format(price.inputs.areaSquareMeters)} m²`,
        );
        expect(await page.locator('.ask-session-status').textContent()).toContain(
          locale === 'en' ? 'Completed' : 'Concluída',
        );
        expect(await page.locator('.ask-record').textContent()).toContain('sao-paulo-pinheiros');
        expect(await page.locator('.ask-record__steps li').count()).toBe(terminal.steps.length);
        expect(
          await page
            .locator('.ask-record__steps time')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
        ).toEqual(terminal.steps.map((step) => step.at));
        expect(await page.locator('.ask-record .prov time').getAttribute('datetime')).toBe(
          price.computedAt,
        );
        expect(await page.locator('.ask-record').textContent()).toContain(
          locale === 'en' ? 'No market citations' : 'Nenhuma citação de mercado',
        );
        expect(await page.locator('.ask-record').textContent()).toContain(
          locale === 'en'
            ? 'no live execution or durable replay'
            : 'sem execução ao vivo nem replay durável',
        );
      }
      await attempt('ASK-001', async (folder) => {
        await page.goto(`${base}/ask/sao-paulo-bela-vista`);
        await page.getByRole('textbox', { name: 'Rascunho da pergunta' }).waitFor();
        expect(reads.some((path) => /\/ask\/|\/runs\/|\/threads\//.test(path))).toBe(false);
        await follow();
        await completed('pt-BR');
        const prior = thread.runs[0]!;
        await page.locator('.ask-thread button').filter({ hasText: prior.question }).click();
        expect(await page.locator('.ask-record h2').textContent()).toBe(prior.question);
        expect(await page.locator('.fig__value').count()).toBe(0);
        expect(await page.locator('.ask-record a').getAttribute('href')).toBe(
          '/search/sao-paulo-bela-vista',
        );
        await captureAskSurface(
          page,
          'ask-history-390-pt-BR',
          folder,
          version,
          manifest,
          directory,
        );
        await page.locator('.ask-thread button').filter({ hasText: terminal.question }).click();
        await completed('pt-BR');
        expect(reads.filter((path) => path === `/api/v1/runs/${example.runId}`)).toHaveLength(1);
      });
      await attempt('ASK-002', async () => {
        for (const source of ['overview', 'property'] as const) {
          await page.goto(
            source === 'overview'
              ? `${base}/places/sao-paulo-bela-vista`
              : `${base}/properties/${preparedPropertyId(1)}`,
          );
          if (source === 'overview') {
            const input = page.locator('.place-question input');
            await input.fill('Private <draft> example');
            await input.press('Enter');
          } else await page.getByRole('link', { name: 'Perguntar sobre este imóvel' }).click();
          const draft = page.getByRole('textbox', { name: 'Rascunho da pergunta' });
          await draft.waitFor();
          const received = await draft.inputValue();
          expect(received.length).toBeGreaterThan(0);
          await draft.fill(received + ' edited');
          await follow();
          await completed('pt-BR');
          expect((await draft.inputValue()) === received + ' edited').toBe(true);
          await page.getByRole('button', { name: 'English', exact: true }).first().click();
          expect(
            (await page.getByRole('textbox', { name: 'Question draft' }).inputValue()) ===
              received + ' edited',
          ).toBe(true);
          await completed('en');
          expect(new URL(page.url()).search).toBe('');
          expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['rei.locale']);
          await page.getByRole('button', { name: 'Português', exact: true }).first().click();
        }
        await page
          .getByRole('navigation', { name: 'Navegação de lugares' })
          .getByRole('link', { name: 'Pinheiros' })
          .click();
        await page.waitForURL('**/ask/sao-paulo-pinheiros');
        await expect
          .poll(
            async () =>
              (await page.getByRole('textbox', { name: 'Rascunho da pergunta' }).inputValue()) ===
              '',
          )
          .toBe(true);
        expect(await page.locator('.ask-record').count()).toBe(0);
      });
      await attempt('ASK-003', async (folder) => {
        for (const failure of ['503', '404', 'malformed']) {
          await page.goto(`${base}/ask/sao-paulo-bela-vista`);
          await page.locator('#ask-draft').waitFor();
          let faults = 0;
          const path = '**/api/v1/ask/fixtures';
          await page.route(path, async (route) => {
            faults++;
            await route.fulfill({
              status: failure === 'malformed' ? 200 : Number(failure),
              body: failure === 'malformed' ? '{}' : 'private-authority-body',
            });
          });
          await follow();
          await page.getByRole('alert').waitFor();
          expect(faults).toBe(1);
          expect(await page.locator('body').textContent()).not.toContain('private-authority-body');
          if (failure === '503')
            await captureAskSurface(
              page,
              'ask-read-failed-390-pt-BR',
              folder,
              version,
              manifest,
              directory,
            );
          await page.unroute(path);
          await page.getByRole('button', { name: 'Tentar de novo' }).click();
          await completed('pt-BR');
        }
      });
      await attempt('ASK-004', async (folder) => {
        for (const corruption of [false, true]) {
          await page.goto(`${base}/ask/sao-paulo-bela-vista`);
          await page.locator('#ask-draft').waitFor();
          const path = `**/api/v1/runs/${example.runId}/events`;
          let calls = 0;
          const evidence: Array<{ authorityMatches: boolean; cursor: string | undefined }> = [];
          await page.route(path, async (route) => {
            calls++;
            const request = route.request();
            evidence.push({
              authorityMatches: request.headers().authorization === headers.Authorization,
              cursor: request.headers()['last-event-id'],
            });
            if (calls === 1) {
              const response = await route.fetch();
              const actual = await response.text();
              const blocks = actual.split('\n\n');
              await route.fulfill({
                response,
                body:
                  blocks.slice(0, corruption ? 2 : 1).join('\n\n') +
                  '\n\n' +
                  (corruption ? 'id: invalid\nevent: ask.completed\ndata: {\n\n' : ''),
              });
            } else await route.continue();
          });
          const runReads = reads.filter(
            (value) => value === `/api/v1/runs/${example.runId}`,
          ).length;
          await follow();
          if (corruption) {
            await page.getByRole('alert').waitFor();
            expect(calls).toBe(1);
            expect(await page.locator('.ask-record h2').textContent()).toBe(initial.question);
            expect(await page.locator('.ask-record__steps li').count()).toBe(
              frames[1]!.run.steps.length,
            );
            expect(await page.locator('.fig__value').count()).toBe(0);
            await captureAskSurface(
              page,
              'ask-interrupted-390-pt-BR',
              folder,
              version,
              manifest,
              directory,
            );
            await page.getByRole('button', { name: 'Tentar de novo' }).click();
          }
          await completed('pt-BR');
          expect(calls).toBe(2);
          expect(evidence[0]).toEqual({ authorityMatches: true, cursor: undefined });
          expect(evidence[1]).toEqual({
            authorityMatches: true,
            cursor: frames[corruption ? 1 : 0]!.id,
          });
          expect(reads.filter((value) => value === `/api/v1/runs/${example.runId}`)).toHaveLength(
            runReads + 1,
          );
          await writeFile(
            new URL(`replay-${corruption ? 'corruption' : 'interruption'}.json`, folder),
            JSON.stringify({ evidence, calls, retained: true, terminal: terminal.id }, null, 2),
          );
          await page.unroute(path);
        }
      });
      await attempt('ASK-005', async (folder) => {
        await page.goto(`${base}/ask/sao-paulo-bela-vista`);
        await page.locator('#ask-draft').waitFor();
        const path = `**/api/v1/runs/${example.runId}/events`;
        let admitted = false,
          release: (() => void) | undefined;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let aborted = false;
        page.on('requestfailed', (request) => {
          if (new URL(request.url()).pathname.endsWith('/events')) aborted = true;
        });
        await page.route(path, async (route) => {
          admitted = true;
          await held;
          await route.abort().catch(() => undefined);
        });
        await follow();
        await expect.poll(() => admitted).toBe(true);
        await page
          .getByRole('navigation', { name: 'Navegação de lugares' })
          .getByRole('link', { name: 'Pinheiros' })
          .click();
        await page.waitForURL('**/ask/sao-paulo-pinheiros');
        try {
          await expect.poll(() => aborted).toBe(true);
        } finally {
          release!();
        }
        expect(await page.locator('.ask-record').count()).toBe(0);
        expect(await page.locator('#ask-draft').inputValue()).toBe('');
        await writeFile(
          new URL('navigation-abort.json', folder),
          JSON.stringify({ observedBeforeRelease: aborted, noObsoleteRecord: true }, null, 2),
        );
        await page.unroute(path);
      });
      await attempt('ASK-006', async (folder) => {
        for (const locale of ['pt-BR', 'en'] as const)
          for (const width of [390, 960, 1440]) {
            await page.setViewportSize({ width, height: width === 390 ? 2034 : 1142 });
            await page.goto(`${base}/ask/sao-paulo-bela-vista`);
            await page.locator('#ask-draft').waitFor();
            await page
              .getByRole('button', { name: locale === 'en' ? 'English' : 'Português', exact: true })
              .first()
              .click();
            await follow();
            await completed(locale);
            const disclosure = page.locator('.ask-identifiers summary');
            await disclosure.focus();
            await page.keyboard.press('Tab');
            await page.keyboard.press('Shift+Tab');
            const focus = await disclosure.evaluate((node) => ({
              active: document.activeElement === node,
              outline: getComputedStyle(node).outlineStyle,
              width: getComputedStyle(node).outlineWidth,
            }));
            expect(focus.active).toBe(true);
            expect(focus.outline).not.toBe('none');
            expect(focus.width).not.toBe('0px');
            await page.keyboard.press('Enter');
            expect(await page.locator('.ask-identifiers').getAttribute('open')).not.toBeNull();
            expect(await page.locator('.ask-identifiers').textContent()).toContain(terminal.id);
            await page.locator('.ask-thread button').last().focus();
            await page.keyboard.press('Enter');
            await page.locator('.ask-thread button').first().focus();
            await page.keyboard.press('Enter');
            await completed(locale);
            await captureAskSurface(
              page,
              `ask-completed-${width}-${locale}`,
              folder,
              version,
              manifest,
              directory,
            );
          }
      });
      await attempt('ASK-007', async (folder) => {
        const server = execa(
          'pnpm',
          [
            '--filter',
            '@rei/web',
            'exec',
            'vite',
            '--host',
            '127.0.0.1',
            '--port',
            String(reference),
            '--strictPort',
          ],
          { cwd: fileURLToPath(new URL('..', import.meta.url)), reject: false },
        );
        await preserveCleanup(
          async () => {
            await expect
              .poll(
                async () => {
                  try {
                    return (
                      await requestHttp(`${referenceBase}/test-fixtures/artboards/Ask.dc.html`)
                    ).status;
                  } catch {
                    return 0;
                  }
                },
                { timeout: 30000, interval: 200 },
              )
              .toBe(200);
            for (const [file, width, height] of [
              ['Ask.dc.html', 390, 2034],
              ['DesktopAsk.dc.html', 1440, 1142],
            ] as const) {
              const referenceContext = await browser!.newContext({
                viewport: { width, height },
                reducedMotion: 'reduce',
              });
              await preserveCleanup(
                async () => {
                  const external: string[] = [];
                  await referenceContext.route('**/*', async (route) => {
                    if (new URL(route.request().url()).origin !== referenceBase) {
                      external.push(new URL(route.request().url()).origin);
                      await route.abort();
                    } else await route.continue();
                  });
                  const view = await referenceContext.newPage();
                  await view.goto(`${referenceBase}/test-fixtures/artboards/${file}`);
                  const captureStart = await settlePropertyCaptureStart(view);
                  const name = `ask-reference-${width}x${height}.png`;
                  await view.screenshot({ path: new URL(name, folder).pathname });
                  expect(external).toEqual([]);
                  manifest.push({
                    file: name,
                    evidencePath: `${folder.pathname.slice(directory.pathname.length)}${name}`,
                    hash: createHash('sha256')
                      .update(await readFile(new URL(name, folder)))
                      .digest('hex'),
                  });
                  await writeFile(
                    new URL(`reference-${width}.json`, folder),
                    JSON.stringify(
                      {
                        file,
                        width,
                        height,
                        captureStart,
                        version,
                        external,
                        sourceHash: createHash('sha256')
                          .update(
                            await readFile(
                              new URL(`../docs/design/canvas/project/${file}`, import.meta.url),
                            ),
                          )
                          .digest('hex'),
                      },
                      null,
                      2,
                    ),
                  );
                },
                () => referenceContext.close(),
              );
            }
          },
          async () => {
            server.kill('SIGTERM');
            const stopped = await server;
            expect(stopped.exitCode === 0 || stopped.signal === 'SIGTERM').toBe(true);
          },
        );
      });
      expect(outside).toEqual([]);
      expect(forbidden).toEqual([]);
      const httpAssets = [];
      for (const asset of version.runtimeAssets) {
        const response = await requestHttp(`${base}/assets/${asset.file}`);
        expect(response.status).toBe(200);
        const sha256 = createHash('sha256')
          .update(await response.text())
          .digest('hex');
        expect(sha256).toBe(asset.sha256);
        httpAssets.push({ file: asset.file, sha256 });
      }
      expect(servedAssets.size).toBeGreaterThan(0);
      for (const [path, sha256] of servedAssets)
        expect(
          version.runtimeAssets.find((asset) => `/assets/${asset.file}` === path)?.sha256,
        ).toBe(sha256);
      await writeFile(
        new URL('served-assets.json', directory),
        JSON.stringify(
          {
            httpAssets,
            browserAssets: Array.from(servedAssets, ([file, sha256]) => ({ file, sha256 })),
            localBuildAssets: version.localAssets,
            localAndRuntimeAssetsEqual:
              JSON.stringify(version.localAssets) === JSON.stringify(version.runtimeAssets),
            scope:
              'Every deployed JS/CSS asset read over HTTP and matched to exact owned runtime files; each browser-loaded asset matched independently. Host build identity is separate, not assumed reproducible across environments.',
            matchesRuntimeBuild: true,
          },
          null,
          2,
        ),
      );
      const after = await askDatabaseState(connection);
      expect(after).toEqual(before);
      await writeFile(
        new URL('sql-effects.json', directory),
        JSON.stringify({ before, after, unchanged: true }, null, 2),
      );
      await writeFile(
        new URL('surfaces.json', directory),
        JSON.stringify({ version, files: manifest }, null, 2),
      );
      await copySurfaceEvidence(
        new URL('surfaces.json', directory),
        new URL('results/surfaces.json', directory),
      );
      await context.close();
    },
    campaign,
    {
      release: [async () => browser?.close(), async () => connection?.close()],
      down: () => fixture.down(),
      verifyForeignResources: async () => {
        const after = await askDockerInventory();
        expect(after.containers).toEqual(expect.arrayContaining(foreign.containers));
        expect(after.volumes).toEqual(expect.arrayContaining(foreign.volumes));
      },
      report: (receipt) =>
        preserveCleanup(
          () =>
            writeFile(
              new URL('teardown.json', directory),
              JSON.stringify({ project, ...receipt }, null, 2),
            ),
          () => writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2)),
        ),
    },
  );
}, 600000);
