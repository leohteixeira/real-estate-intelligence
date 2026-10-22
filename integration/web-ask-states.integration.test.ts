import { createHash, randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { chromium, type Browser, type Page } from 'playwright';
import { expect, test } from 'vitest';
import {
  ASK_STATES,
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseAskRun,
  parseAskThread,
  type AskFixtureCatalogue,
  type AskProgressEvent,
  type AskRun,
  type AskState,
  type AskThread,
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
import { runAskAttempt } from './support/ask-attempt.ts';
import { runAskCampaign } from './support/ask-campaign.ts';
import { copySurfaceEvidence } from './support/search-campaign.ts';
import { settlePropertyCaptureStart } from './support/property-capture.ts';

const scenarios = [
  [
    'ASK-STATES-000',
    'Owned setup and independent oracle',
    'Unique Compose project and sandboxed browser',
    'Read every actual prepared snapshot, thread and finite SSE preview',
    'All evidence is public-parser admitted; failures before the first surface remain in the ledger',
  ],
  [
    'ASK-STATES-001',
    'Seven deliberate snapshots',
    'The real catalogue and ordered threads',
    'Select each state in PT and EN without following',
    'Question, state, times, steps, terminal reason and absent runtime facts match; no automatic stream',
  ],
  [
    'ASK-STATES-002',
    'Unsent local edits and recorded continuation',
    'Awaiting confirmation with null confirmation/result',
    'Edit, restore, rephrase, change locale and explicitly read recorded continuation',
    'No mutation, private URL/storage/log payload or early result; original and recorded evidence stay distinct',
  ],
  [
    'ASK-STATES-003',
    'Read failure, cursor recovery and obsolete authority',
    'Real prepared bytes with bounded transport faults',
    'Retry a refused read, recover corrupt continuation, switch away from held reads',
    'Sanitized errors retain admitted evidence and use the cursor; obsolete authority cannot win',
  ],
  [
    'ASK-STATES-004',
    'Bilingual responsive confirmation and comparison',
    'Real awaiting and recorded completed evidence',
    'Keyboard-operate and capture 390/960/1440 PT/EN plus state variants',
    'Whole-page axe, 44px targets, focus, fonts and overflow pass with final source and runtime asset hashes',
  ],
  [
    'ASK-STATES-005',
    'Authored reference evidence',
    'Unmodified AskConfirm, DesktopAsk and States artboards',
    'Capture exact authored sizes on an owned Vite server',
    'Reference source, dependency and capture hashes are independent from production captures',
  ],
  [
    'ASK-STATES-006',
    'Final read-only and artifact boundaries',
    'All browser scenarios and owned runtime assets',
    'Compare served asset bytes, network boundaries and database row digests',
    'No POST, external origin, diagnostic leak or SQL change; final evidence hashes describe final bytes',
  ],
].map(([id, title, given, when, then]) => ({
  id: id!,
  title: title!,
  given: given!,
  when: when!,
  then: then!,
}));

test('Ask inspects every prepared state and explicitly reads recorded confirmation through owned HTTP and Chromium', async () => {
  const runId = `ask-states-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = new URL(`../apps/web/.impeccable/review/campaigns/${runId}/`, import.meta.url);
  for (const folder of ['catalog/', 'results/', 'fixtures/', 'evidence/'])
    await mkdir(new URL(folder, directory), { recursive: true });
  await writeFile(
    new URL('catalog/scenarios.json', directory),
    JSON.stringify({ scenarios }, null, 2),
  );
  const project = `rei-web-ask-states-${randomUUID()}`;
  const campaign = {
    runId,
    project,
    status: 'running',
    startedUtc: new Date().toISOString(),
    stackTornDownUtc: null as string | null,
    scope: 'D-068 prepared read continuation; no live confirm/cancel or persisted run mutation',
    exclusions: [
      'Parent visual comparison, detector, finish review/documenter and acceptance',
      'Human screen-reader, daylight and zoom assessment; no complete WCAG certification',
    ],
  };
  const manifest: AskSurface[] = [];
  const oracle = new Map<
    AskState,
    { run: AskRun; thread: AskThread; frames: AskProgressEvent[] }
  >();
  let fixture: ComposeFixture | undefined,
    browser: Browser | undefined,
    page: Page | undefined,
    connection: DatabaseConnection | undefined;
  let foreign: Awaited<ReturnType<typeof askDockerInventory>> | undefined;
  let before: Awaited<ReturnType<typeof askDatabaseState>> | undefined;
  let version: Awaited<ReturnType<typeof askVersion>> | undefined;
  let catalogue: AskFixtureCatalogue | undefined;
  let base = '',
    referenceBase = '',
    referencePort = 0;
  const reads: string[] = [],
    forbidden: string[] = [],
    outside: string[] = [];
  let diagnosticLeak = false;
  let attempts = 0;
  const privateMarker = 'unsent-private-state-draft';
  async function attempt(id: string, work: (folder: URL) => Promise<void>) {
    const attemptId = `${id}-${++attempts}`,
      folder = new URL(`evidence/${attemptId}/`, directory),
      startedUtc = new Date().toISOString();
    await mkdir(folder, { recursive: true });
    await runAskAttempt(() => work(folder), {
      captures: [
        ...(page
          ? [
              {
                name: 'final.png',
                run: () =>
                  page!.screenshot({
                    path: new URL('final.png', folder).pathname,
                    fullPage: true,
                    mask: [page!.locator('textarea,input')],
                  }),
              },
            ]
          : []),
        {
          name: 'environment.json',
          run: () =>
            writeFile(
              new URL('environment.json', folder),
              JSON.stringify(
                { version: version ?? null, project, browserAvailable: Boolean(page) },
                null,
                2,
              ),
            ),
        },
        {
          name: 'readback.json',
          run: () =>
            writeFile(
              new URL('readback.json', folder),
              JSON.stringify(
                {
                  url: page?.url() ?? null,
                  reads,
                  forbidden,
                  outside,
                  diagnosticLeak,
                  privateValues:
                    'Excluded; screenshot fields masked and no raw console/error/authority captured.',
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
            startedUtc,
            finishedUtc: new Date().toISOString(),
            status: failed ? 'failed' : 'approved',
            actionFailed,
            produced,
            expected: scenarios.find((item) => item.id === id)?.then,
            reason: failed
              ? 'Work or required evidence failed; see runner output. No executor-only classification inferred.'
              : 'Declared independent checks passed.',
          }) + '\n',
        ),
    });
  }
  await writeFile(new URL('campaign.json', directory), JSON.stringify(campaign, null, 2));
  await runAskCampaign(
    async () => {
      await attempt('ASK-STATES-000', async () => {
        foreign = await askDockerInventory();
        const [postgres, api, web, reference] = await allocatePorts(4);
        referencePort = reference!;
        base = `http://127.0.0.1:${web}`;
        referenceBase = `http://127.0.0.1:${reference}`;
        const settings = {
          NODE_ENV: 'test',
          POSTGRES_DB: 'rei_web_ask_states',
          POSTGRES_USER: 'rei_web_ask_states',
          POSTGRES_PASSWORD: 'controlled-ask-states-fixture',
          POSTGRES_PORT: String(postgres),
          API_PORT: String(api),
          WEB_PORT: String(web),
          OTEL_EXPORTER_OTLP_ENDPOINT: '',
        };
        fixture = new ComposeFixture(project, settings);
        await fixture.up(['--build', 'postgres', 'migrations', 'api', 'web']);
        const database = new URL(`postgres://127.0.0.1:${postgres}/${settings.POSTGRES_DB}`);
        database.username = settings.POSTGRES_USER;
        database.password = settings.POSTGRES_PASSWORD;
        connection = new DatabaseConnection(database.toString());
        before = await askDatabaseState(connection);
        version = await askVersion(project, base);
        expect(version.sourceFiles).toContain('apps/web/src/ask/AskConfirmation.tsx');
        await writeFile(new URL('version.json', directory), JSON.stringify(version, null, 2));
        const availability = parseAskAvailability(
          await (await requestHttp(`${base}/api/v1/ask/capabilities`)).json(),
        );
        expect(availability.commandHandlers).toBe(false);
        catalogue = parseAskFixtureCatalogue(
          await (await requestHttp(`${base}/api/v1/ask/fixtures`)).json(),
        );
        for (const example of catalogue.items) {
          const headers = { Authorization: `Bearer ${example.grant.capability}` };
          const run = parseAskRun(
            await (await requestHttp(`${base}/api/v1/runs/${example.runId}`, { headers })).json(),
          );
          const thread = parseAskThread(
            await (
              await requestHttp(`${base}/api/v1/threads/${example.threadId}`, { headers })
            ).json(),
          );
          const frames = askOracleFrames(
            await (
              await requestHttp(`${base}/api/v1/runs/${example.runId}/events`, { headers })
            ).text(),
          );
          expect(run.state).toBe(example.state);
          expect(thread.runs.at(-1)).toEqual(run);
          expect(frames[0]!.run).toEqual(run);
          expect(frames.at(-1)!.terminal).toBe(true);
          oracle.set(example.state, { run, thread, frames });
        }
        const confirmation = oracle.get('awaiting_confirmation')!;
        expect(confirmation.run.confirmation).toBeNull();
        expect(confirmation.run.result).toBeNull();
        expect(confirmation.run.decision).toMatchObject({
          confidence: 0.64,
          degraded: true,
          requiresConfirmation: true,
        });
        expect(confirmation.frames.at(-1)!.run.confirmation).toMatchObject({
          source: 'recorded-synthetic',
          inputs: { priceMinorUnits: 81000000, areaSquareMeters: 90 },
        });
        expect(confirmation.frames.at(-1)!.run.result).toMatchObject({ minorUnits: 900000 });
        await writeFile(
          new URL('fixtures/oracle.json', directory),
          JSON.stringify(
            {
              availability,
              entries: Array.from(oracle, ([state, evidence]) => ({ state, ...evidence })),
              authority: 'Catalogue grants omitted.',
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
            if (url.pathname.startsWith('/api/')) {
              expect(request.url()).not.toContain(privateMarker);
              expect(request.postData()).toBeNull();
              reads.push(url.pathname + url.search);
            }
            await route.continue();
          }
        });
        page = await context.newPage();
        page.on('console', (event) => {
          if (event.text().includes(privateMarker)) diagnosticLeak = true;
        });
        page.on('pageerror', (error) => {
          if (error.message.includes(privateMarker)) diagnosticLeak = true;
        });
      });
      const view = page!;
      async function enter(locale: 'pt-BR' | 'en' = 'pt-BR') {
        await view.goto(`${base}/ask/sao-paulo-bela-vista`);
        await view.locator('#ask-draft').waitFor();
        await view
          .getByRole('button', { name: locale === 'en' ? 'English' : 'Português', exact: true })
          .first()
          .click();
      }
      async function inspect(state: AskState) {
        await view.locator('#ask-state').selectOption(state);
        if (state === 'queued')
          await view
            .getByRole('button', { name: /Ler o estado selecionado|Read the selected state/ })
            .click();
        await expect
          .poll(() => view.locator('.ask-record__head h2').textContent())
          .toBe(oracle.get(state)!.run.question);
        await expect
          .poll(() => view.locator('.ask-record__head time').getAttribute('datetime'))
          .toBe(oracle.get(state)!.run.updatedAt);
        await expect
          .poll(() => view.locator('.ask-identifiers .kv').textContent())
          .toContain(oracle.get(state)!.run.id);
      }
      const preview = () =>
        view
          .getByRole('button', { name: /Ler a continuação gravada|Read the recorded continuation/ })
          .click();
      const isCompleted = () =>
        expect
          .poll(() => view.locator('.ask-record .fig__value').textContent())
          .toMatch(/9[.,]000[.,]00/);
      await attempt('ASK-STATES-001', async (folder) => {
        const evidence = [];
        for (const locale of ['pt-BR', 'en'] as const) {
          await enter(locale);
          for (const state of ASK_STATES) {
            const count = reads.filter((path) => path.endsWith('/events')).length;
            await inspect(state);
            const expected = oracle.get(state)!.run;
            expect(await view.locator('.ask-record__steps li').count()).toBe(expected.steps.length);
            expect(
              await view
                .locator('.ask-record__steps time')
                .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
            ).toEqual(expected.steps.map((step) => step.at));
            expect(await view.locator('.fig__value').count()).toBe(
              expected.result?.kind === 'price_per_square_meter' ? 1 : 0,
            );
            expect(await view.locator('.ask-origin').allTextContents()).toEqual(
              expect.arrayContaining([
                expect.stringMatching(
                  locale === 'en'
                    ? /Quotas, thread slots, queue position and expiry deadline are unavailable/
                    : /Cotas, vagas da conversa, posição na fila e prazo de expiração não estão disponíveis/,
                ),
              ]),
            );
            if (expected.terminal)
              expect(await view.locator('.ask-terminal-reason').textContent()).toMatch(
                state === 'cancelled'
                  ? /sintético|synthetic/
                  : state === 'expired'
                    ? /prazo|deadline/
                    : state === 'failed'
                      ? /falha preparada|prepared failure/
                      : /resultado|result/,
              );
            if (['failed', 'cancelled', 'expired'].includes(state)) {
              expect(await view.locator('.ask-record__result').textContent()).toContain(
                locale === 'en'
                  ? 'This record ended without returning a result.'
                  : 'Este registro terminou sem retornar um resultado.',
              );
            }
            if (state === 'cancelled' || state === 'expired') {
              expect(await view.locator('.ask-confirmation').getAttribute('class')).toContain(
                'ask-confirmation--recorded',
              );
              expect(await view.locator('#ask-proposal-title').textContent()).toBe(
                locale === 'en' ? 'Recorded proposal' : 'Proposta registrada',
              );
            }
            expect(reads.filter((path) => path.endsWith('/events'))).toHaveLength(count);
            evidence.push({
              locale,
              state,
              id: expected.id,
              steps: expected.steps,
              terminal: expected.terminal,
              noAutomaticStream: true,
            });
          }
        }
        await view
          .locator('.ask-thread button')
          .filter({ hasText: oracle.get('expired')!.thread.runs[0]!.question })
          .click();
        expect(await view.locator('.ask-unavailable').textContent()).toMatch(
          /não está disponível|not available/,
        );
        const search = view.getByRole('link', { name: 'Search properties', exact: true });
        expect(await search.getAttribute('href')).toBe('/search/sao-paulo-bela-vista');
        await search.click();
        await view.waitForURL('**/search/sao-paulo-bela-vista');
        await writeFile(
          new URL('snapshot-agreement.json', folder),
          JSON.stringify({ evidence, samePlaceSearch: true }, null, 2),
        );
      });
      await attempt('ASK-STATES-002', async (folder) => {
        await enter('en');
        await inspect('awaiting_confirmation');
        expect(await view.locator('.gate').getAttribute('aria-label')).toBe(
          'Confidence 0.64, threshold 0.85',
        );
        expect(await view.locator('.fig__value').count()).toBe(0);
        expect(await view.locator('.ask-recorded-confirmation').count()).toBe(0);
        await view.locator('#ask-price').fill(privateMarker);
        await view.locator('#ask-area').fill('');
        await view.locator('#ask-draft').fill(privateMarker);
        const beforeLocale = reads.length;
        await view.getByRole('button', { name: 'Português', exact: true }).first().click();
        expect(await view.locator('#ask-price').inputValue()).toBe(privateMarker);
        expect(reads).toHaveLength(beforeLocale);
        await view.getByRole('button', { name: 'Reformular meu rascunho' }).click();
        expect(
          await view.locator('#ask-draft').evaluate((node) => node === document.activeElement),
        ).toBe(true);
        await view.getByRole('button', { name: 'Restaurar valores originais' }).click();
        expect(await view.locator('#ask-price').inputValue()).toBe('800000');
        expect(await view.locator('#ask-area').inputValue()).toBe('80');
        await view.locator('#ask-price').fill('123');
        await view.locator('#ask-area').fill('invalid');
        await preview();
        await isCompleted();
        const received = oracle.get('awaiting_confirmation')!.frames.at(-1)!.run;
        expect(await view.locator('.ask-recorded-confirmation').textContent()).toContain(
          'recorded-synthetic',
        );
        expect(await view.locator('.ask-recorded-confirmation').textContent()).toContain(
          'R$ 800.000,00 · 80 m²',
        );
        expect(await view.locator('.ask-recorded-confirmation').textContent()).toContain(
          'R$ 810.000,00 · 90 m²',
        );
        expect(await view.locator('.ask-record .fig > .small').textContent()).toBe(
          'R$ 810.000,00 ÷ 90 m²',
        );
        expect(await view.locator('#ask-price').inputValue()).toBe('123');
        expect(await view.locator('#ask-draft').inputValue()).toBe(privateMarker);
        expect(await view.locator('.ask-record .prov time').getAttribute('datetime')).toBe(
          received.result?.kind === 'price_per_square_meter' ? received.result.computedAt : null,
        );
        expect(
          await view.evaluate(() => ({
            local: Object.entries(localStorage),
            session: Object.entries(sessionStorage),
            url: location.href,
          })),
        ).toEqual({
          local: [['rei.locale', 'pt-BR']],
          session: [],
          url: `${base}/ask/sao-paulo-bela-vista`,
        });
        expect(diagnosticLeak).toBe(false);
        const example = catalogue!.items.find((item) => item.state === 'awaiting_confirmation')!;
        const reread = parseAskRun(
          await (
            await requestHttp(`${base}/api/v1/runs/${example.runId}`, {
              headers: { Authorization: `Bearer ${example.grant.capability}` },
            })
          ).json(),
        );
        expect(reread).toEqual(oracle.get('awaiting_confirmation')!.run);
        await writeFile(
          new URL('confirmation-agreement.json', folder),
          JSON.stringify(
            {
              received,
              fixedGetStillPaused: true,
              localValuesNotAccepted: true,
              noPrivateUrlStorageDiagnostics: true,
            },
            null,
            2,
          ),
        );
        await view.locator('#ask-draft').fill('');
        await view.getByRole('button', { name: 'Restaurar valores originais' }).click();
      });
      await attempt('ASK-STATES-003', async (folder) => {
        await enter('en');
        const example = catalogue!.items.find((item) => item.state === 'awaiting_confirmation')!;
        const runPath = `**/api/v1/runs/${example.runId}`;
        await view.route(runPath, (route) =>
          route.fulfill({ status: 503, body: 'private refusal payload' }),
        );
        await view.locator('#ask-state').selectOption('awaiting_confirmation');
        await view.getByRole('alert').waitFor();
        expect(await view.locator('body').textContent()).not.toContain('private refusal payload');
        await view.unroute(runPath);
        await view.getByRole('button', { name: 'Try again', exact: true }).click();
        await view.locator('#ask-price').waitFor();
        const frames = oracle.get('awaiting_confirmation')!.frames;
        const path = `**/api/v1/runs/${example.runId}/events`;
        const cursorEvidence: Array<{ cursor: string | undefined; authorityMatches: boolean }> = [];
        await view.route(path, async (route) => {
          const headers = route.request().headers();
          cursorEvidence.push({
            cursor: headers['last-event-id'],
            authorityMatches: headers.authorization === `Bearer ${example.grant.capability}`,
          });
          if (cursorEvidence.length === 1) {
            const frame = frames[0]!;
            await route.fulfill({
              contentType: 'text/event-stream',
              body: `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(frame)}\n\ndata: private corrupt payload\n\n`,
            });
          } else await route.continue();
        });
        const beforeRunReads = reads.filter(
          (path) => path === `/api/v1/runs/${example.runId}`,
        ).length;
        await preview();
        await view.getByRole('alert').waitFor();
        expect(await view.locator('.fig__value').count()).toBe(0);
        expect(await view.locator('body').textContent()).not.toContain('private corrupt payload');
        await view.getByRole('button', { name: 'Try again', exact: true }).click();
        await isCompleted();
        expect(cursorEvidence).toEqual([
          { cursor: undefined, authorityMatches: true },
          { cursor: frames[0]!.id, authorityMatches: true },
        ]);
        expect(reads.filter((path) => path === `/api/v1/runs/${example.runId}`)).toHaveLength(
          beforeRunReads,
        );
        await view.unroute(path);
        await enter('en');
        let release: (() => void) | undefined;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        let reached = false,
          aborted = false;
        const failed = (request: import('playwright').Request) => {
          if (new URL(request.url()).pathname === `/api/v1/runs/${example.runId}`) aborted = true;
        };
        view.on('requestfailed', failed);
        await view.route(runPath, async (route) => {
          reached = true;
          await held;
          await route.abort().catch(() => undefined);
        });
        await preserveCleanup(
          async () => {
            await view.locator('#ask-state').selectOption('awaiting_confirmation');
            await expect.poll(() => reached).toBe(true);
            await view.locator('#ask-state').selectOption('failed');
            await expect
              .poll(() => view.locator('.ask-identifiers .kv').textContent())
              .toContain(oracle.get('failed')!.run.id);
            await expect.poll(() => aborted).toBe(true);
            expect(await view.locator('.ask-confirmation').count()).toBe(0);
          },
          async () => {
            release!();
            view.off('requestfailed', failed);
            await view.unroute(runPath);
          },
        );
        await writeFile(
          new URL('recovery-authority.json', folder),
          JSON.stringify(
            { cursorEvidence, abortedBeforeRelease: aborted, oldAuthorityNotDisplayed: true },
            null,
            2,
          ),
        );
      });
      await attempt('ASK-STATES-004', async (folder) => {
        for (const locale of ['pt-BR', 'en'] as const)
          for (const width of [390, 960, 1440]) {
            await view.setViewportSize({ width, height: width === 390 ? 2034 : 1142 });
            await enter(locale);
            await inspect('awaiting_confirmation');
            const price = view.locator('#ask-price');
            await price.focus();
            await view.keyboard.press('ControlOrMeta+A');
            await view.keyboard.type('54321');
            await view.keyboard.press('Tab');
            await view.keyboard.press('ControlOrMeta+A');
            await view.keyboard.press('Backspace');
            expect(await view.locator('#ask-area').inputValue()).toBe('');
            await view
              .getByRole('button', { name: /Restaurar valores originais|Restore original values/ })
              .focus();
            await view.keyboard.press('Enter');
            expect(await price.inputValue()).toBe('800000');
            const focus = await view.locator('#ask-area').evaluate((node) => {
              node.focus();
              const style = getComputedStyle(node);
              return {
                active: document.activeElement === node,
                outline: style.outlineStyle,
                width: style.outlineWidth,
              };
            });
            expect(focus.active).toBe(true);
            expect(focus.outline).not.toBe('none');
            expect(focus.width).not.toBe('0px');
            await captureAskSurface(
              view,
              `ask-confirmation-${width}-${locale}`,
              folder,
              version,
              manifest,
              directory,
            );
            await view
              .getByRole('button', {
                name: /Ler a continuação gravada|Read the recorded continuation/,
              })
              .focus();
            await view.keyboard.press('Enter');
            await isCompleted();
            await captureAskSurface(
              view,
              `ask-recorded-completed-${width}-${locale}`,
              folder,
              version,
              manifest,
              directory,
            );
          }
        for (const [locale, width] of [
          ['pt-BR', 390],
          ['en', 1440],
        ] as const) {
          await view.setViewportSize({ width, height: width === 390 ? 2034 : 1142 });
          await enter(locale);
          for (const state of ASK_STATES) {
            await inspect(state);
            await captureAskSurface(
              view,
              `ask-state-${state}-${width}-${locale}`,
              folder,
              version,
              manifest,
              directory,
            );
          }
        }
      });
      await attempt('ASK-STATES-005', async (folder) => {
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
            String(referencePort),
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
                      await requestHttp(
                        `${referenceBase}/test-fixtures/artboards/AskConfirm.dc.html`,
                      )
                    ).status;
                  } catch {
                    return 0;
                  }
                },
                { timeout: 30000, interval: 200 },
              )
              .toBe(200);
            for (const [file, width, height] of [
              ['AskConfirm.dc.html', 390, 1443],
              ['DesktopAsk.dc.html', 1440, 1142],
              ['States.dc.html', 1280, 1127],
            ] as const) {
              const context = await browser!.newContext({
                viewport: { width, height },
                reducedMotion: 'reduce',
              });
              await preserveCleanup(
                async () => {
                  const external: string[] = [];
                  await context.route('**/*', async (route) => {
                    if (new URL(route.request().url()).origin !== referenceBase) {
                      external.push(new URL(route.request().url()).origin);
                      await route.abort();
                    } else await route.continue();
                  });
                  const reference = await context.newPage();
                  await reference.goto(`${referenceBase}/test-fixtures/artboards/${file}`);
                  const captureStart = await settlePropertyCaptureStart(reference);
                  const name = `ask-states-reference-${file.replace('.dc.html', '')}-${width}x${height}.png`;
                  await reference.screenshot({
                    path: new URL(name, folder).pathname,
                    fullPage: true,
                  });
                  expect(external).toEqual([]);
                  manifest.push({
                    file: name,
                    evidencePath: `${folder.pathname.slice(directory.pathname.length)}${name}`,
                    hash: createHash('sha256')
                      .update(await readFile(new URL(name, folder)))
                      .digest('hex'),
                  });
                  const dependencies = [];
                  for (const dependency of [file, 'tokens.css', 'components.css'])
                    dependencies.push({
                      file: dependency,
                      sha256: createHash('sha256')
                        .update(
                          await readFile(
                            new URL(`../docs/design/canvas/project/${dependency}`, import.meta.url),
                          ),
                        )
                        .digest('hex'),
                    });
                  await writeFile(
                    new URL(`${file}-reference.json`, folder),
                    JSON.stringify(
                      { file, width, height, captureStart, external, dependencies, version },
                      null,
                      2,
                    ),
                  );
                },
                () => context.close(),
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
      await attempt('ASK-STATES-006', async () => {
        expect(forbidden).toEqual([]);
        expect(outside).toEqual([]);
        expect(diagnosticLeak).toBe(false);
        const servedAssets = [];
        for (const asset of version!.runtimeAssets) {
          const response = await requestHttp(`${base}/assets/${asset.file}`);
          expect(response.status).toBe(200);
          const sha256 = createHash('sha256')
            .update(await response.text())
            .digest('hex');
          expect(sha256).toBe(asset.sha256);
          servedAssets.push({ file: asset.file, sha256 });
        }
        const after = await askDatabaseState(connection!);
        expect(after).toEqual(before);
        await writeFile(
          new URL('sql-effects.json', directory),
          JSON.stringify({ before, after, unchanged: true }, null, 2),
        );
        await writeFile(
          new URL('read-only-boundaries.json', directory),
          JSON.stringify(
            { forbidden, outside, diagnosticLeak, servedAssets, noSqlChanges: true, noPost: true },
            null,
            2,
          ),
        );
        await writeFile(
          new URL('surfaces.json', directory),
          JSON.stringify({ version, files: manifest }, null, 2),
        );
        await copySurfaceEvidence(
          new URL('surfaces.json', directory),
          new URL('results/surfaces.json', directory),
        );
      });
    },
    campaign,
    {
      release: [async () => browser?.close(), async () => connection?.close()],
      down: async () => {
        if (fixture) await fixture.down();
      },
      verifyForeignResources: async () => {
        if (foreign) {
          const after = await askDockerInventory();
          expect(after.containers).toEqual(expect.arrayContaining(foreign.containers));
          expect(after.volumes).toEqual(expect.arrayContaining(foreign.volumes));
        }
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
