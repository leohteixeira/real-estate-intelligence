import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import {
  ASK_STATES,
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseAskRun,
  parseAskThread,
  parseEnabledSourcesResponse,
  parsePlaceResponse,
  parsePlacesResponse,
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
  parseReductionsResponse,
  type AskRun,
  type AskState,
} from '../packages/contracts/dist/index.js';
import { DatabaseConnection } from '../packages/infrastructure/dist/index.js';
import { allocatePorts, ComposeFixture, preserveCleanup } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
import { allowOwnedEndpoint, finishNetwork, guardNetwork } from './support/network.ts';
import {
  askDatabaseState,
  askDockerInventory,
  askOracleFrames,
} from './support/ask-web-evidence.ts';
import { runAskCampaign } from './support/ask-campaign.ts';
import { runAskAttempt } from './support/ask-attempt.ts';
import { checkAccessibility } from './support/accessibility.ts';
import { settlePropertyCaptureStart } from './support/property-capture.ts';
import {
  readProperty,
  preparedPropertyId,
  checkProperty,
  propertyMoney,
} from './support/property-reads.ts';
import {
  readListing,
  readListingContext,
  checkListing,
  preparedListingId,
} from './support/listing-reads.ts';
import { readSearch, checkSearchRows, searchParameters } from './support/search-reads.ts';
import { holdAccessibilityRead } from './support/accessibility-fault.ts';
import {
  accessibilityBoundaries,
  accessibilityEntryContract,
  accessibilityLocales,
  accessibilityPartitions,
  accessibilityExecutionSteps,
  accessibilityScenarios,
  accessibilityStateMapping,
  accessibilityScreens,
  accessibilityWidths,
} from './support/accessibility-catalog.ts';
import {
  measureAccessibility,
  publicLocaleControlSelector,
  publicPrivacyEntrySelector,
  prepareAccessibilityHierarchy,
  assessContrast,
  setNativeZoom,
  walkKeyboard,
} from './support/accessibility-browser.ts';
import {
  accessibilityVersion,
  appendAccessibilityAttempt,
  sha256,
  writeAccessibilityEvidence,
} from './support/accessibility-evidence.ts';

import { accessibilitySteps, type AccessibilityCheckpoint } from './support/accessibility-steps.ts';

const placeId = 'sao-paulo-bela-vista';
describe('accessibility owned production partition:', () => {
  async function runAccessibilityPartition(
    partition: string,
    checkpoint: AccessibilityCheckpoint = async (_name, work) => work(),
    onOwnedBase: (base: string) => void = () => undefined,
  ) {
    const runId = `accessibility-${partition}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const directory = new URL(
      `../apps/web/.impeccable/review/campaigns/${runId}/`,
      import.meta.url,
    );
    for (const path of ['catalog/', 'evidence/', 'results/', 'fixtures/'])
      await mkdir(new URL(path, directory), { recursive: true });
    const manifest: Array<{ file: string; sha256: string }> = [];
    const json = async (name: string, value: unknown) => {
      const entry = await writeAccessibilityEvidence(directory, name, value);
      manifest.push(entry);
      return entry;
    };
    const drainFault = async (
      fault: Awaited<ReturnType<typeof holdAccessibilityRead>>,
      name: string,
      extra: Record<string, unknown> = {},
    ) => {
      await preserveCleanup(
        () => fault.close(),
        () =>
          json(name, {
            ...extra,
            cleanup: fault.cleanup,
            requested: fault.requested,
            dispatches: fault.dispatches,
            delivered: fault.delivered,
            errors: fault.errors,
          }).then(() => undefined),
      );
      expect(fault.errors).toEqual([]);
    };
    await json('catalog/scenarios.json', {
      partitions: accessibilityPartitions,
      stateMapping: accessibilityStateMapping,
      scenarios: accessibilityScenarios.map((scenario) => ({
        ...scenario,
        area: 'Delivered anonymous MVP',
        persona: 'Anonymous keyboard visitor',
        journey: scenario.title,
        verification: { oracle: scenario.given, method: scenario.when },
      })),
      screens: accessibilityScreens,
      entryContract: accessibilityEntryContract,
      locales: accessibilityLocales,
      widths: accessibilityWidths,
      boundaries: accessibilityBoundaries,
    });
    await writeFile(
      new URL('catalog/accessibility.feature', directory),
      `Feature: Delivered MVP accessibility\n\n${accessibilityScenarios.map((scenario) => `  Scenario: ${scenario.id} ${scenario.title}\n    Given ${scenario.given}\n    When ${scenario.when}\n    Then ${scenario.then}\n`).join('\n')}`,
      { flag: 'wx' },
    );
    const project = `rei-web-accessibility-${randomUUID()}`;
    const campaign = {
      runId,
      partition,
      project,
      status: 'running',
      startedUtc: new Date().toISOString(),
      stackTornDownUtc: null as string | null,
      scope: 'D-070 delivered anonymous MVP, no certification claim',
      boundaries: accessibilityBoundaries,
    };
    let fixture: ComposeFixture | undefined,
      context: BrowserContext | undefined,
      page: Page | undefined,
      connection: DatabaseConnection | undefined;
    let foreign: Awaited<ReturnType<typeof askDockerInventory>> | undefined;
    let before: Awaited<ReturnType<typeof askDatabaseState>> | undefined;
    let version: Awaited<ReturnType<typeof accessibilityVersion>> | undefined;
    const reads: string[] = [],
      outside: string[] = [],
      forbidden: string[] = [];
    const readResponses: Array<{ path: string; status: number; requestId?: string }> = [];
    const cells: Array<{
      name: string;
      scenario: string;
      locale: string;
      width: number;
      url: string;
      status: string;
    }> = [];
    const runs = new Map<AskState, AskRun>();
    const navigationIds: string[] = [];
    const hierarchyIds: string[] = [];
    const frames = new Map<AskState, ReturnType<typeof askOracleFrames>>();
    const privateMarker = 'a11y-private-local-operand';
    let diagnosticLeak = false;
    let recordedFailure: unknown;
    let base = '',
      listingId = '',
      attemptNumber = 0;
    async function attempt(id: string, name: string, work: () => Promise<void>) {
      const attemptId = `${id}-${++attemptNumber}-${name}`;
      const startedUtc = new Date().toISOString();
      const initialManifestLength = manifest.length;
      const environmentFile = `evidence/${attemptId}-environment.json`;
      const finalFile = `evidence/${attemptId}-final.png`;
      let actionError: unknown;
      await runAskAttempt(
        async () => {
          try {
            await work();
          } catch (error) {
            actionError = error;
            recordedFailure = error;
            throw error;
          }
        },
        {
          captures: [
            {
              name: environmentFile,
              run: () =>
                json(environmentFile, {
                  version: version ?? { project, phase: 'setup' },
                  url: page?.url(),
                  reads,
                  readResponses,
                  outside,
                  forbidden,
                }),
            },
            ...(page
              ? [
                  {
                    name: finalFile,
                    run: async () => {
                      const file = finalFile;
                      await settlePropertyCaptureStart(page!);
                      await page!.screenshot({
                        path: new URL(file, directory).pathname,
                        fullPage: true,
                        mask: [page!.locator('textarea,input')],
                      });
                      manifest.push({
                        file,
                        sha256: sha256(await readFile(new URL(file, directory))),
                      });
                    },
                  },
                ]
              : []),
          ],
          report: ({ failed, actionFailed, produced }) =>
            appendAccessibilityAttempt(directory, {
              attemptId,
              scenarioId: id,
              kind: name === 'setup' ? 'pilot' : 'scenario',
              status: name === 'setup' ? 'inconclusive' : failed ? 'failed' : 'approved',
              executorError:
                failed &&
                (name === 'executor-preparation' ||
                  !(actionError instanceof Error && actionError.name === 'AssertionError')),
              reason:
                name === 'setup'
                  ? 'Provisioning and baseline pilot, not scenario acceptance'
                  : failed
                    ? String(actionError ?? 'Evidence capture failed')
                    : 'Expected production UI and boundary assertions matched',
              startedUtc,
              finishedUtc: new Date().toISOString(),
              evidence: [
                ...new Set([
                  ...manifest.slice(initialManifestLength).map((entry) => entry.file),
                  ...produced,
                ]),
              ],
              environmentEvidence: environmentFile,
              finalUiEvidence: produced.includes(finalFile) ? finalFile : undefined,
              verification: {
                expected: 'Scenario assertions and evidence captures succeed',
                observed: failed
                  ? String(actionError ?? 'Capture failure')
                  : 'All assertions passed',
                comparison: failed
                  ? 'Mismatch; original error retained'
                  : 'Native Vitest assertions matched',
              },
              actionFailed,
            }),
        },
      );
    }
    async function enter(path: string, locale: 'pt-BR' | 'en', width: number, ready: string) {
      await page!.setViewportSize({ width, height: 1142 });
      // Mobile Filters intentionally hides the common shell locale controls. Choose a locale on
      // an ordinary public screen first; never force a hidden control or change product behavior.
      const filters = new URL(path, base).searchParams.get('view') === 'filters';
      await page!.goto(base + (filters ? '/privacy' : path));
      const localeControl = page!
        .locator(publicLocaleControlSelector(locale))
        .filter({ visible: true });
      await localeControl.waitFor({ state: 'visible' });
      expect(await localeControl.count(), 'Unique explicit locale preparation entry').toBe(1);
      await localeControl.click();
      if (filters) await page!.goto(base + path);
      await page!.locator(ready).filter({ visible: true }).first().waitFor();
      if (ready === '.place-key-figures') {
        await page!.locator('.place-chart__months time').first().waitFor();
        await page!.locator('.place-neighbour').first().waitFor();
        const reductions = parseReductionsResponse(
          await (
            await requestHttp(`${base}/api/v1/places/${placeId}/largest-reductions?pageSize=3`)
          ).json(),
        );
        if (reductions.items.length)
          await expect
            .poll(() => page!.locator('.place-reductions .prow').count())
            .toBe(reductions.items.length);
        else
          await expect
            .poll(() => page!.locator('.place-reductions').textContent())
            .toContain(
              locale === 'en'
                ? 'No recorded price reductions.'
                : 'Nenhuma redução de preço registrada.',
            );
        await expect
          .poll(() => page!.locator('main [aria-busy="true"], main .system-loading').count())
          .toBe(0);
      }
      await page!.evaluate(() => document.fonts.ready);
    }
    async function keyboardReach(selector: string) {
      // Presence is preparation only: invalid recovery selectors must fail boundedly,
      // rather than traversing the same native cycle a thousand times.
      const target = page!.locator(selector).filter({ visible: true });
      await target.first().waitFor({ state: 'visible' });
      expect(await target.count(), `Unique visible activation target: ${selector}`).toBe(1);
      for (let index = 0; index < 1000; index++) {
        await page!.keyboard.press('Tab');
        if (
          await page!
            .locator(selector)
            .evaluateAll(
              (elements) =>
                document.hasFocus() &&
                elements.some((element) => element === document.activeElement),
            )
        ) {
          return;
        }
      }
      throw new Error(`Native Tab could not reach ${selector}`);
    }
    async function keyboardActivate(selector: string) {
      await keyboardReach(selector);
      await page!.keyboard.press('Enter');
    }
    async function observeRouteFocus(id: string, evidence: string) {
      const observations: { at: number; tag: string | undefined; id: string | undefined }[] = [];
      try {
        await expect
          .poll(async () => {
            const observed = await page!.evaluate(() => ({
              at: performance.now(),
              tag: document.activeElement?.tagName,
              id: document.activeElement?.id,
            }));
            observations.push(observed);
            return observed.id;
          })
          .toBe(id);
      } finally {
        await json(`evidence/${evidence}.json`, {
          expected: id,
          observations,
          method: 'Observe asynchronous route effect only; no focus or scroll mutation',
        });
      }
    }
    async function settleUnaffected(region: string) {
      // A held child read does not synchronize its independent siblings. Wait for their
      // actual content before asserting the remaining page has no loading state.
      if (
        region !== 'main' &&
        region !== '#place-overview' &&
        (await page!.locator('#place-overview').count())
      ) {
        // The secondary figures come from the same market read that feeds the median.
        if (region !== '.place-median') await page!.locator('.place-secondary').waitFor();
        if (region !== '.place-series')
          await page!.locator('.place-chart__months time').first().waitFor();
        if (region !== '.place-neighbours')
          await page!.locator('.place-neighbour').first().waitFor();
        if (region !== '.place-reductions')
          await page!
            .locator('.place-reductions .prow')
            .or(
              page!.getByText(
                /^(?:No recorded price reductions\.|Nenhuma redução de preço registrada\.)$/,
              ),
            )
            .first()
            .waitFor();
      }
      await expect
        .poll(() =>
          page!
            .locator('main .system-loading,main [aria-busy="true"]')
            .evaluateAll(
              (nodes, excluded) => nodes.filter((node) => !node.closest(excluded)).length,
              region,
            ),
        )
        .toBe(0);
      await page!.evaluate(() => document.fonts.ready);
    }
    async function retryAlerts(
      region: string,
      fault: Awaited<ReturnType<typeof holdAccessibilityRead>>,
      mode: 'malformed' | 'valid',
      recovered?: () => Promise<void>,
    ) {
      fault.setMode(mode);
      // LoadErrorState deliberately keeps its recovery action outside the alert.
      const buttons = `${region} .system-error > button.btn--primary:visible`;
      const count = await page!.locator(buttons).count();
      expect(count).toBeGreaterThan(0);
      // Recovering a parent read can reveal another independently failed subread.
      // Each iteration is a real visitor action, not an automatic request retry.
      const seen = new Set<string>();
      const actions: Array<{
        identity: string;
        before: string[];
        after: string[];
        deliveries: typeof fault.delivered;
        deliveryStart: number;
      }> = [];
      const descriptions = () =>
        page!.locator(`${region} .system-error:visible > [role="alert"]`).allTextContents();
      try {
        for (let step = 0; step < (mode === 'valid' ? 10 : count); step++) {
          if (mode === 'valid' && !(await page!.locator(buttons).count())) break;
          const index = mode === 'valid' ? 0 : count - step - 1;
          const before = await descriptions();
          expect(new Set(before).size, `Unique subread descriptions in ${region}`).toBe(
            before.length,
          );
          const identity = `${region}: ${before[index]!}`;
          expect(
            seen.has(identity),
            `Only one native action per subread and ${mode} phase: ${identity}`,
          ).toBe(false);
          seen.add(identity);
          const deliveryStart = fault.delivered.length;
          const action = {
            identity,
            deliveryStart,
            before,
            after: [] as string[],
            deliveries: [] as typeof fault.delivered,
          };
          actions.push(action);
          const previous = fault.delivered.filter((delivery) => delivery.mode === mode).length;
          await keyboardActivate(`${buttons} >> nth=${index}`);
          await expect
            .poll(() => fault.delivered.filter((delivery) => delivery.mode === mode).length)
            .toBe(previous + 1);
          // Observe this read's React commit. Recovering a parent may legitimately start
          // dependent reads; callers await their content before the settled-state audit.
          if (mode === 'valid') {
            await expect
              .poll(async () => (await descriptions()).includes(before[index]!))
              .toBe(false);
            await recovered?.();
          }
          await expect.poll(() => page!.locator(`${region} .system-loading`).count()).toBe(0);
          if (mode === 'malformed')
            await expect.poll(() => page!.locator(buttons).count()).toBe(count);
          action.after = await descriptions();
          action.deliveries = fault.delivered.slice(deliveryStart);
        }
      } finally {
        const last = actions.at(-1);
        if (last) {
          last.after = await descriptions();
          last.deliveries = fault.delivered.slice(last.deliveryStart);
        }
        await json(`evidence/recovery-actions-${cells.length}-${manifest.length}.json`, {
          region,
          mode,
          actions,
        });
      }
      if (mode === 'valid') expect(await page!.locator(buttons).count()).toBe(0);
    }
    async function openEvidence() {
      // Each disclosure is activated by actual Tab/Enter. Newly exposed nested summaries join the walk.
      for (let count = 0; count < 100; count++) {
        const closed = page!
          .locator('main details:not([open]) > summary')
          .filter({ visible: true })
          .first();
        if (!(await closed.count())) return;
        const path = await closed.evaluate(
          (element) =>
            `summary:${Array.from(document.querySelectorAll<Element>('summary')).indexOf(element)}`,
        );
        for (let index = 0; index < 1000; index++) {
          await page!.keyboard.press('Tab');
          const active = await page!.evaluate(() =>
            document.hasFocus()
              ? `summary:${Array.from(document.querySelectorAll('summary')).indexOf(document.activeElement as HTMLElement)}`
              : 'browser-chrome',
          );
          if (active === path) {
            await page!.keyboard.press('Enter');
            break;
          }
          if (index === 999) throw new Error(`Disclosure unreachable: ${path}`);
        }
      }
      throw new Error('Disclosure inventory exceeds bounded 100 native summaries');
    }
    async function closeEvidence() {
      // Pointer activation is declared preparation, separate from the audited native traversal.
      for (let count = 0; count < 100; count++) {
        const open = page!.locator('main details[open] > summary').filter({ visible: true }).last();
        if (!(await open.count())) return;
        await open.click();
      }
      throw new Error('Open disclosure inventory exceeds bounded 100 summaries');
    }
    async function auditPair(
      name: string,
      scenario: string,
      locale: string,
      width: number,
      options: AuditReadiness = {},
    ) {
      await checkpoint(name, async () => {
        await closeEvidence();
        await auditCell(`${name}-default`, scenario, locale, width, options);
        if (await page!.locator('main details > summary').filter({ visible: true }).count()) {
          await openEvidence();
          await auditCell(`${name}-open`, scenario, locale, width, options);
        }
      });
    }
    type AuditReadiness = {
      navigation?: 'unavailable';
      hierarchy?: 'fallback';
      listingContext?: 'loading' | 'unverified';
    };
    async function audit(
      name: string,
      scenario: string,
      locale: string,
      width: number,
      readiness: AuditReadiness = {},
    ) {
      await checkpoint(name, () => auditCell(name, scenario, locale, width, readiness));
    }
    async function auditCell(
      name: string,
      scenario: string,
      locale: string,
      width: number,
      readiness: AuditReadiness = {},
    ) {
      await attempt(scenario, name, async () => {
        await prepareAccessibilityHierarchy(page!, {
          ...((await page!.locator('.place-navigation').count())
            ? { navigation: readiness.navigation === 'unavailable' ? [] : navigationIds }
            : {}),
          ...((await page!.locator('#filter-place').count())
            ? { filters: readiness.hierarchy === 'fallback' ? [placeId] : hierarchyIds }
            : {}),
        });
        if (await page!.locator('.listing-values').count()) {
          if (readiness.listingContext) {
            expect(await page!.locator('.listing-head .property-location').count()).toBe(0);
            if (readiness.listingContext === 'loading') {
              expect(await page!.locator('.listing-context .system-error').count()).toBe(0);
              expect(await page!.locator('.listing-context').textContent()).toContain(
                locale === 'en' ? 'Loading property context…' : 'Carregando contexto do imóvel…',
              );
            } else await page!.locator('.listing-context [role="alert"]').waitFor();
          } else await page!.locator('.listing-head .property-location').waitFor();
        }
        const geometry = await measureAccessibility(page!);
        const keyboard = await walkKeyboard(
          page!,
          async ({ direction, index, identity, problem }) => {
            const file = `evidence/${name}-focused-${direction}-${index}.png`;
            const observeFocusPaint = () =>
              page!.evaluate(() => {
                const element = document.activeElement;
                if (!(element instanceof HTMLElement)) return null;
                const style = getComputedStyle(element);
                const parent = element.parentElement;
                return {
                  documentFocused: document.hasFocus(),
                  tag: element.tagName,
                  id: element.id,
                  className: element.className,
                  focus: element.matches(':focus'),
                  focusVisible: element.matches(':focus-visible'),
                  parentFocusWithin: parent?.matches(':focus-within') ?? false,
                  outline: style.outline,
                  outlineOffset: style.outlineOffset,
                  background: style.backgroundColor,
                  parentBackground: parent ? getComputedStyle(parent).backgroundColor : null,
                  parentShadow: parent ? getComputedStyle(parent).boxShadow : null,
                  inlineOutline: element.style.outline,
                  inlineOutlineOffset: element.style.outlineOffset,
                };
              });
            const beforeCapture = await observeFocusPaint();
            // Capture while native focus/scroll is untouched, before the next traversal step.
            await page!.screenshot({
              path: new URL(file, directory).pathname,
              mask: [page!.locator('textarea,input')],
            });
            manifest.push({ file, sha256: sha256(await readFile(new URL(file, directory))) });
            await json(`evidence/${name}-focused-${direction}-${index}.json`, {
              identity,
              problem,
              direction,
              index,
              file,
              beforeCapture,
              afterCapture: await observeFocusPaint(),
            });
          },
        );
        const contrast = [
          ...geometry.textRoles
            .filter((role) => role.text?.trim())
            .map((role) => ({
              kind: 'text',
              ...role,
              foreground: role.color,
              assessment: assessContrast(
                { ...role, foreground: role.color },
                parseFloat(role.fontSize) >= 24 ||
                  (Number(role.fontWeight) >= 700 && parseFloat(role.fontSize) >= 18.667)
                  ? 3
                  : 4.5,
              ),
            })),
          ...geometry.boundaries.map((role) => ({
            kind: 'essential-field-boundary',
            ...role,
            assessment: assessContrast(role, 3),
          })),
          ...keyboard.directions.flatMap((direction) =>
            direction.steps.map((step) => ({
              kind: 'focus',
              direction: direction.key,
              identity: step.identity,
              ...step.focusContrast,
              assessment: assessContrast(step.focusContrast, 3),
            })),
          ),
        ];
        expect(
          JSON.stringify({ geometry, keyboard, contrast }).includes(privateMarker),
          'Private local operands must not enter accessibility receipts',
        ).toBe(false);
        await json(`evidence/${name}-contrast.json`, {
          roles: contrast,
          limitation:
            'Computed opaque paint is numerically gated. Manual alpha/gradient/shadow/canvas roles are not numerical approvals and require explicit finish adjudication; no uniform ancestor is substituted for canvas/sibling scrim.',
          axeIncomplete: `evidence/${name}-accessibility.json#/incomplete`,
        });
        await json(`evidence/${name}-interaction.json`, {
          geometry,
          keyboard,
          url: page!.url(),
          observedUtc: new Date().toISOString(),
          readiness,
        });
        // Existing helper preserves every axe incomplete result with unchanged rules. Unique run path avoids collisions.
        let axeError: unknown;
        try {
          await checkAccessibility(page!, `campaigns/${runId}/evidence/${name}`);
        } catch (error) {
          axeError = error;
        }
        const axeFile = `evidence/${name}-accessibility.json`;
        const axeBytes = JSON.parse(await readFile(new URL(axeFile, directory), 'utf8')) as unknown;
        // Format in place before hashing; never copy an earlier run's capture.
        const { format, resolveConfig } = await import('prettier');
        await writeFile(
          new URL(axeFile, directory),
          await format(JSON.stringify(axeBytes), {
            ...(await resolveConfig(new URL(axeFile, directory).pathname)),
            filepath: new URL(axeFile, directory).pathname,
          }),
        );
        manifest.push({
          file: axeFile,
          sha256: sha256(await readFile(new URL(axeFile, directory))),
        });
        const file = `evidence/${name}-top.png`;
        const captureStart = await settlePropertyCaptureStart(page!);
        await json(`evidence/${name}-capture-start.json`, captureStart);
        await page!.screenshot({
          path: new URL(file, directory).pathname,
          mask: [page!.locator('textarea,input')],
        });
        manifest.push({ file, sha256: sha256(await readFile(new URL(file, directory))) });
        const region = page!.locator('main').first();
        if (await region.count()) {
          const regionFile = `evidence/${name}-region.png`;
          await region.screenshot({
            path: new URL(regionFile, directory).pathname,
            mask: [page!.locator('textarea,input')],
          });
          manifest.push({
            file: regionFile,
            sha256: sha256(await readFile(new URL(regionFile, directory))),
          });
        }
        if (axeError) throw axeError;
        for (const role of contrast)
          if (role.assessment.status === 'computed')
            expect(role.assessment.ratio, JSON.stringify(role)).toBeGreaterThanOrEqual(
              role.assessment.minimum,
            );
        expect(geometry.overflow, JSON.stringify(geometry)).toBe(false);
        expect(geometry.fonts.content?.family, name).toContain('Barlow');
        expect(geometry.fonts.barlow, name).toBe(true);
        expect(
          geometry.targets.filter((target) => target.width < 44 || target.height < 44),
          name,
        ).toEqual([]);
        for (const direction of keyboard.directions) {
          expect(direction.missing, `${name} ${direction.key}`).toEqual([]);
          expect(
            direction.steps.filter(
              (step) =>
                !step.focusVisible ||
                !step.indicator ||
                !step.visible ||
                !step.unobscured ||
                step.clippedBy.length,
            ),
            `${name} ${direction.key}`,
          ).toEqual([]);
        }
        expect(keyboard.inventoryChanged, `${name}: controls changed during traversal`).toBe(false);
        cells.push({ name, scenario, locale, width, url: page!.url(), status: 'approved' });
      });
    }
    await runAskCampaign(
      async () => {
        try {
          await attempt('A11Y-006', 'setup', async () => {
            foreign = await askDockerInventory();
            const [postgres, api, web] = await allocatePorts(3);
            base = `http://127.0.0.1:${web}`;
            onOwnedBase(base);
            const settings = {
              NODE_ENV: 'test',
              POSTGRES_DB: 'rei_accessibility',
              POSTGRES_USER: 'rei_accessibility',
              POSTGRES_PASSWORD: 'controlled-accessibility-fixture',
              POSTGRES_PORT: String(postgres),
              API_PORT: String(api),
              WEB_PORT: String(web),
              OTEL_EXPORTER_OTLP_ENDPOINT: '',
              VITE_PRIVACY_CONTROLLER_NAME: '',
              VITE_PRIVACY_CONTACT_EMAIL: '',
            };
            fixture = new ComposeFixture(project, settings, { preparedSearch: true });
            await fixture.up(['--build', 'postgres', 'migrations', 'api', 'web']);
            const database = new URL(`postgres://127.0.0.1:${postgres}/${settings.POSTGRES_DB}`);
            database.username = settings.POSTGRES_USER;
            database.password = settings.POSTGRES_PASSWORD;
            connection = new DatabaseConnection(database.toString());
            before = await askDatabaseState(connection);
            version = await accessibilityVersion(project, base);
            await json('version.json', version);
            const hierarchy = parsePlacesResponse(
              await (await requestHttp(`${base}/api/v1/places`)).json(),
            );
            const pending = [...hierarchy.items];
            const visited = new Set<string>();
            for (let index = 0; index < pending.length; index++) {
              const item = pending[index]!;
              expect(visited.has(item.id), 'Hierarchy cycle').toBe(false);
              visited.add(item.id);
              hierarchyIds.push(item.id);
              if (item.kind === 'neighborhood') navigationIds.push(item.id);
              if (item.kind !== 'street-block') {
                const children = parsePlacesResponse(
                  await (await requestHttp(`${base}/api/v1/places/${item.id}/children`)).json(),
                );
                expect(children.items.every((child) => child.parentId === item.id)).toBe(true);
                pending.push(...children.items);
              }
            }
            await json('evidence/navigation-oracle.json', { navigationIds, hierarchyIds });
            const property = await readProperty(base, preparedPropertyId(1));
            listingId = property.property.listings[0]!.id;
            const listing = await readListing(base, listingId);
            expect(listing.listing.propertyId).toBe(property.property.summary.id);
            const search = await readSearch(base, { placeId });
            const empty = await readSearch(base, { placeId, minArea: 999999 });
            expect(search.totalItems).toBeGreaterThan(0);
            expect(empty.totalItems).toBe(0);
            const place = parsePlaceResponse(
              await (await requestHttp(`${base}/api/v1/places/${placeId}`)).json(),
            );
            const market = parsePlaceMarketResponse(
              await (await requestHttp(`${base}/api/v1/places/${placeId}/market`)).json(),
            );
            const sources = parseEnabledSourcesResponse(
              await (await requestHttp(`${base}/api/v1/collection/sources`)).json(),
            );
            const availability = parseAskAvailability(
              await (await requestHttp(`${base}/api/v1/ask/capabilities`)).json(),
            );
            expect(availability.commandHandlers).toBe(false);
            const catalogue = parseAskFixtureCatalogue(
              await (await requestHttp(`${base}/api/v1/ask/fixtures`)).json(),
            );
            for (const entry of catalogue.items) {
              const headers = { Authorization: `Bearer ${entry.grant.capability}` };
              const run = parseAskRun(
                await (await requestHttp(`${base}/api/v1/runs/${entry.runId}`, { headers })).json(),
              );
              const thread = parseAskThread(
                await (
                  await requestHttp(`${base}/api/v1/threads/${entry.threadId}`, { headers })
                ).json(),
              );
              const stream = askOracleFrames(
                await (
                  await requestHttp(`${base}/api/v1/runs/${entry.runId}/events`, { headers })
                ).text(),
              );
              expect(run.state).toBe(entry.state);
              expect(thread.runs.at(-1)).toEqual(run);
              expect(stream[0]!.run).toEqual(run);
              expect(stream.at(-1)!.terminal).toBe(true);
              runs.set(entry.state, run);
              frames.set(entry.state, stream);
            }
            await json('fixtures/oracles.json', {
              property,
              listing,
              search,
              empty,
              place,
              market,
              sources,
              availability,
              runs: Array.from(runs),
              frames: Array.from(frames),
              grants: 'Omitted from evidence',
            });
            const env = { ...process.env };
            delete env.DISPLAY;
            context = await chromium.launchPersistentContext('', {
              channel: 'chromium',
              chromiumSandbox: true,
              env,
              viewport: { width: 1440, height: 1142 },
              reducedMotion: 'reduce',
              args: [
                '--ozone-platform=headless',
                '--disable-vulkan-surface',
                '--use-gl=angle',
                '--use-angle=swiftshader-webgl',
              ],
              ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
            });
            // Observe independently of routing: page-level fault routes also pass through this guard.
            context.on('request', (request) => {
              const url = new URL(request.url());
              if (url.origin !== base) outside.push(url.origin);
              if (url.pathname.startsWith('/api/')) {
                if (request.method() !== 'GET')
                  forbidden.push(`${request.method()} ${url.pathname}`);
                if (request.url().includes(privateMarker) || request.postData() !== null)
                  diagnosticLeak = true;
                reads.push(url.pathname + url.search);
              }
            });
            context.on('response', (response) => {
              const url = new URL(response.url());
              if (url.origin !== base || !url.pathname.startsWith('/api/v1/')) return;
              const requestId = response.headers()['x-request-id'];
              readResponses.push({
                path: url.pathname + url.search,
                status: response.status(),
                ...(requestId && /^[0-9a-f-]{36}$/i.test(requestId) ? { requestId } : {}),
              });
            });
            await context.route('**/*', async (route) => {
              const request = route.request(),
                url = new URL(request.url());
              if (url.origin !== base) {
                await route.abort();
              } else if (url.pathname.startsWith('/api/') && request.method() !== 'GET') {
                await route.abort();
              } else {
                if (url.pathname.startsWith('/api/')) {
                  expect(request.url()).not.toContain(privateMarker);
                  expect(request.postData()).toBeNull();
                }
                await route.continue();
              }
            });
            page = context.pages()[0] ?? (await context.newPage());
            page.setDefaultTimeout(30_000);
            page.on('console', (event) => {
              if (event.text().includes(privateMarker)) diagnosticLeak = true;
            });
            page.on('pageerror', (error) => {
              if (error.message.includes(privateMarker)) diagnosticLeak = true;
            });
            await page.goto(base + '/privacy');
            await page.locator('.privacy-source').first().waitFor();
            // This run's diagnostic pilot is provisioning evidence, not scenario acceptance.
            await json('evidence/pilot.json', {
              keyboard: await walkKeyboard(page),
              geometry: await measureAccessibility(page),
              bypassLinks: await page.locator('a[href="#public-content"]').count(),
            });
          });
          const view = page!;
          if (partition.startsWith('variants-')) {
            for (const locale of accessibilityLocales.filter((locale) =>
              partition.startsWith(`variants-${locale}-`),
            ))
              for (const width of accessibilityWidths.filter((width) =>
                partition.endsWith(`-${width}`),
              )) {
                for (const suffix of [4, 901, 902, 903]) {
                  const expected = await readProperty(base, preparedPropertyId(suffix));
                  await json(`fixtures/property-${suffix}.json`, expected);
                  await enter(
                    `/properties/${preparedPropertyId(suffix)}`,
                    locale,
                    width,
                    '.property-basis',
                  );
                  await checkProperty(view, expected, locale);
                  await auditPair(
                    `property-${suffix}-${locale}-${width}`,
                    'A11Y-001',
                    locale,
                    width,
                  );
                }
                for (const suffix of [104, 109, 991, 992, 993]) {
                  const expected = await readListing(base, preparedListingId(suffix));
                  const property = await readListingContext(base, expected);
                  // Canonical synthetic positions need not form a complete Property set.
                  // Derive the expected verified branch independently of the UI helper.
                  const member = property.property.listings.find(
                    (listing) => listing.id === expected.listing.id,
                  );
                  const contextVerified =
                    property.property.summary.id === expected.listing.propertyId &&
                    member?.propertyId === expected.listing.propertyId &&
                    member.position === expected.listing.position &&
                    expected.listing.position >= 1 &&
                    expected.listing.position <= property.property.listings.length;
                  await json(`fixtures/listing-${suffix}.json`, {
                    expected,
                    property,
                    contextVerified,
                  });
                  await enter(`/listings/${expected.listing.id}`, locale, width, '.listing-values');
                  if (contextVerified)
                    await view.locator('.listing-head .property-location').waitFor();
                  else {
                    await view.locator('.listing-context .system-error > [role="alert"]').waitFor();
                    expect(await view.locator('.listing-head .property-location').count()).toBe(0);
                  }
                  await checkListing(view, expected, property, locale);
                  await auditPair(
                    `listing-${suffix}-${locale}-${width}`,
                    'A11Y-001',
                    locale,
                    width,
                    contextVerified ? {} : { listingContext: 'unverified' },
                  );
                }
                for (const family of ['properties', 'listings']) {
                  for (const id of ['invalid-id', '0199a3e0-0000-4000-8000-000000000001']) {
                    const start = reads.length;
                    await enter(`/${family}/${id}`, locale, width, 'main[role="alert"]');
                    expect(
                      reads.slice(start).filter((read) => read === `/api/v1/${family}/${id}`),
                    ).toEqual([]);
                    await audit(
                      `${family}-invalid-${id}-${locale}-${width}`,
                      'A11Y-003',
                      locale,
                      width,
                    );
                  }
                  const absent = preparedPropertyId(999);
                  const oracle = await requestHttp(`${base}/api/v1/${family}/${absent}`);
                  expect(oracle.status).toBe(404);
                  await enter(
                    `/${family}/${absent}`,
                    locale,
                    width,
                    'main .place-state [role="alert"]',
                  );
                  expect(await view.locator('main h1').count()).toBe(1);
                  await audit(`${family}-404-${locale}-${width}`, 'A11Y-003', locale, width);
                }
                for (const family of ['places', 'search', 'ask']) {
                  await enter(`/${family}/Invalid!`, locale, width, 'main[role="alert"]');
                  await audit(
                    `${family}-invalid-place-${locale}-${width}`,
                    'A11Y-003',
                    locale,
                    width,
                    { navigation: 'unavailable' },
                  );
                  expect(
                    (await requestHttp(`${base}/api/v1/places/missing-neighbourhood`)).status,
                  ).toBe(404);
                  await enter(
                    `/${family}/missing-neighbourhood`,
                    locale,
                    width,
                    'main [role="alert"]',
                  );
                  await audit(`${family}-404-${locale}-${width}`, 'A11Y-003', locale, width);
                }
              }
          }
          if (partition.startsWith('subreads-')) {
            for (const locale of accessibilityLocales.filter((locale) =>
              partition.startsWith(`subreads-${locale}-`),
            ))
              for (const width of accessibilityWidths.filter((width) =>
                partition.endsWith(`-${width}`),
              ))
                for (const fault of [
                  {
                    id: 'place-detail',
                    api: `/api/v1/places/${placeId}`,
                    region: '#place-overview',
                    parse: parsePlaceResponse,
                  },
                  {
                    id: 'place-series',
                    api: `/api/v1/places/${placeId}/market/monthly-series`,
                    region: '.place-series',
                    parse: parsePlaceMarketSeriesResponse,
                  },
                  {
                    id: 'place-neighbours',
                    api: `/api/v1/places/${placeId}/market/neighbours`,
                    region: '.place-neighbours',
                    parse: parsePlaceMarketNeighboursResponse,
                  },
                  {
                    id: 'place-reductions',
                    api: `/api/v1/places/${placeId}/largest-reductions?pageSize=3`,
                    region: '.place-reductions',
                    parse: parseReductionsResponse,
                  },
                ]) {
                  const pattern = `${base}${fault.api}`;
                  const response = await requestHttp(pattern);
                  expect(response.status).toBe(200);
                  const bytes = await response.text();
                  await json(
                    `fixtures/${fault.id}.json`,
                    fault.parse(JSON.parse(bytes) as unknown),
                  );
                  const held = await holdAccessibilityRead(view, pattern, bytes);
                  await preserveCleanup(
                    async () => {
                      await enter(
                        `/places/${placeId}`,
                        locale,
                        width,
                        `${fault.region} [role="status"]`,
                      );
                      await settleUnaffected(fault.region);
                      await auditPair(
                        `${fault.id}-loading-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      held.setMode('refused');
                      await view
                        .locator(`${fault.region} [role="alert"]`)
                        .filter({ visible: true })
                        .first()
                        .waitFor();
                      await auditPair(
                        `${fault.id}-refused-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts(fault.region, held, 'malformed');
                      await auditPair(
                        `${fault.id}-malformed-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts(fault.region, held, 'valid', async () => {
                        await settleUnaffected('.no-fault-region');
                      });
                      await auditPair(
                        `${fault.id}-recovered-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                    },
                    async () => {
                      await drainFault(
                        held,
                        `evidence/${fault.id}-transport-${locale}-${width}.json`,
                        {
                          method:
                            'Actual admitted bytes; only held, 503, truncated JSON or unchanged genuine API response',
                        },
                      );
                    },
                  );
                }
          }
          if (partition.startsWith('context-')) {
            for (const locale of accessibilityLocales.filter((locale) =>
              partition.startsWith(`context-${locale}-`),
            ))
              for (const width of accessibilityWidths.filter((width) =>
                partition.endsWith(`-${width}`),
              )) {
                for (const endpoint of ['/api/v1/places', '/api/v1/places/brazil/children']) {
                  const response = await requestHttp(base + endpoint);
                  expect(response.status).toBe(200);
                  const bytes = await response.text();
                  parsePlacesResponse(JSON.parse(bytes) as unknown);
                  const held = await holdAccessibilityRead(view, base + endpoint, bytes);
                  // Both independent consumers traverse roots AND children before publishing
                  // their hierarchy. Holding either endpoint also leaves shell navigation pending.
                  const options: AuditReadiness = {
                    navigation: 'unavailable',
                    hierarchy: 'fallback',
                  };
                  await preserveCleanup(
                    async () => {
                      await enter(
                        `/search/${placeId}?view=filters`,
                        locale,
                        width,
                        '#filter-place',
                      );
                      await view
                        .locator('.search-filters__actions button[type="submit"]:enabled')
                        .waitFor();
                      await audit(
                        `hierarchy-${endpoint.split('/').at(-1)}-loading-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                        options,
                      );
                      held.setMode('refused');
                      await view.locator('.search-filters__place [role="alert"]').waitFor();
                      {
                        const shellAlert = view.locator('.place-navigation [role="alert"]');
                        await shellAlert.waitFor({ state: width === 390 ? 'attached' : 'visible' });
                        expect(await shellAlert.isVisible()).toBe(width !== 390);
                        await json(
                          `evidence/hierarchy-${endpoint.split('/').at(-1)}-shell-visibility-${locale}-${width}.json`,
                          {
                            attached: true,
                            visible: await shellAlert.isVisible(),
                            visualAudit:
                              width === 390
                                ? 'Deferred until native mobile Filters close; hidden shell is not a visual cell'
                                : 'Visible shell included in the Filters audit',
                          },
                        );
                      }
                      await audit(
                        `hierarchy-${endpoint.split('/').at(-1)}-refused-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                        options,
                      );
                      // The shell and Filters each own a real hierarchy read and explicit recovery.
                      await retryAlerts('.place-app', held, 'malformed');
                      await audit(
                        `hierarchy-${endpoint.split('/').at(-1)}-malformed-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                        options,
                      );
                      await retryAlerts('.place-app', held, 'valid');
                      await audit(
                        `hierarchy-${endpoint.split('/').at(-1)}-recovered-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                        width === 390 ? { navigation: 'unavailable' } : {},
                      );
                      if (width === 390) {
                        // The mobile sheet intentionally hides shell recovery. Close it through
                        // its real keyboard action before retrying the independently failed shell.
                        await keyboardActivate('.search-filters__head a');
                        await view.locator('.search-rows li').first().waitFor();
                        await retryAlerts('.place-navigation', held, 'valid');
                        await auditPair(
                          `hierarchy-${endpoint.split('/').at(-1)}-shell-recovered-${locale}-${width}`,
                          'A11Y-003',
                          locale,
                          width,
                        );
                      }
                    },
                    async () => {
                      await drainFault(
                        held,
                        `evidence/hierarchy-${endpoint.split('/').at(-1)}-${locale}-${width}.json`,
                      );
                    },
                  );
                }
                const expected = await readListing(base, listingId);
                const property = await readListingContext(base, expected);
                const endpoint = `${base}/api/v1/properties/${expected.listing.propertyId}`;
                const bytes = await (await requestHttp(endpoint)).text();
                for (const opened of [false, true]) {
                  const held = await holdAccessibilityRead(view, endpoint, bytes);
                  let phase = 'navigation';
                  const requestedAt: number[] = [];
                  const timeoutObservation = {
                    requestedAt,
                    firstObservedAt: null as number | null,
                    error: null as string | null,
                  };
                  const observeRequest = (request: import('playwright').Request) => {
                    if (request.url() === endpoint) requestedAt.push(Date.now());
                  };
                  view.on('request', observeRequest);
                  const listingReads = reads.filter(
                    (read) => read === `/api/v1/listings/${listingId}`,
                  ).length;
                  await preserveCleanup(
                    async () => {
                      try {
                        await enter(`/listings/${listingId}`, locale, width, '.listing-values');
                        const observedTimeout = view
                          .locator('.listing-context [role="alert"]')
                          .waitFor()
                          .then(
                            () => {
                              timeoutObservation.firstObservedAt = Date.now();
                              return { observedAt: timeoutObservation.firstObservedAt };
                            },
                            (error: unknown) => {
                              timeoutObservation.error = String(error);
                              return { error: timeoutObservation.error };
                            },
                          );
                        if (opened) await openEvidence();
                        phase = 'loading-audit';
                        await audit(
                          `listing-context-loading-${opened ? 'open' : 'default'}-${locale}-${width}`,
                          'A11Y-003',
                          locale,
                          width,
                          { listingContext: 'loading' },
                        );
                        const timeout = await observedTimeout;
                        expect(
                          timeout,
                          'Genuine context timeout observed independently of audit duration',
                        ).toHaveProperty('observedAt');
                        if (!('observedAt' in timeout)) throw new Error(timeout.error);
                        expect(requestedAt.length).toBe(1);
                        const deadline = timeout.observedAt - requestedAt[0]!;
                        expect(deadline).toBeGreaterThanOrEqual(9000);
                        expect(deadline).toBeLessThan(20000);
                        await json(
                          `evidence/listing-context-deadline-${opened ? 'open' : 'default'}-${locale}-${width}.json`,
                          {
                            milliseconds: deadline,
                            requestAt: requestedAt[0],
                            firstObservedAt: timeout.observedAt,
                            method:
                              'Concurrent bounded DOM observation; excludes subsequent axe/keyboard duration',
                            requested: held.requested,
                            listingReads:
                              reads.filter((read) => read === `/api/v1/listings/${listingId}`)
                                .length - listingReads,
                          },
                        );
                        phase = 'timeout-oracle-preparation';
                        await closeEvidence();
                        await checkListing(view, expected, undefined, locale);
                        await auditPair(
                          `listing-context-timeout-${opened ? 'open' : 'default'}-${locale}-${width}`,
                          'A11Y-003',
                          locale,
                          width,
                          { listingContext: 'unverified' },
                        );
                        held.setMode('refused');
                        await keyboardActivate(
                          '.listing-context .system-error > button.btn--primary',
                        );
                        await expect
                          .poll(() =>
                            held.delivered.some((delivery) => delivery.mode === 'refused'),
                          )
                          .toBe(true);
                        await view.locator('.listing-context [role="alert"]').waitFor();
                        await auditPair(
                          `listing-context-refused-${opened ? 'open' : 'default'}-${locale}-${width}`,
                          'A11Y-003',
                          locale,
                          width,
                          { listingContext: 'unverified' },
                        );
                        await retryAlerts('.listing-context', held, 'malformed');
                        await auditPair(
                          `listing-context-malformed-${opened ? 'open' : 'default'}-${locale}-${width}`,
                          'A11Y-003',
                          locale,
                          width,
                          { listingContext: 'unverified' },
                        );
                        await retryAlerts('.listing-context', held, 'valid');
                        phase = 'recovered-oracle-preparation';
                        await view.locator('.listing-head .property-location').waitFor();
                        await closeEvidence();
                        await checkListing(view, expected, property, locale);
                        expect(
                          reads.filter((read) => read === `/api/v1/listings/${listingId}`).length -
                            listingReads,
                        ).toBe(1);
                        await auditPair(
                          `listing-context-recovered-${opened ? 'open' : 'default'}-${locale}-${width}`,
                          'A11Y-003',
                          locale,
                          width,
                        );
                        phase = 'complete';
                      } catch (error) {
                        await json(
                          `evidence/listing-context-primary-${opened ? 'open' : 'default'}-${locale}-${width}.json`,
                          {
                            phase,
                            error: String(error),
                            stack: error instanceof Error ? error.stack : null,
                            timeoutObservation,
                          },
                        );
                        throw error;
                      }
                    },
                    async () => {
                      view.off('request', observeRequest);
                      await json(
                        `evidence/listing-context-before-drain-${opened ? 'open' : 'default'}-${locale}-${width}.json`,
                        {
                          phase,
                          timeoutObservation,
                          requested: held.requested,
                          delivered: held.delivered,
                          errors: held.errors,
                        },
                      );
                      await drainFault(
                        held,
                        `evidence/listing-context-${opened ? 'open' : 'default'}-${locale}-${width}.json`,
                        {
                          timeoutObservation,
                          phase,
                        },
                      );
                    },
                  );
                }
              }
          }
          const discovery = partition.startsWith('discovery-');
          const details = partition.startsWith('details-');
          if (discovery) {
            await attempt('A11Y-001', 'owned-entry-contract', async () => {
              const healthDocument = await requestHttp(base + '/index.html');
              const healthBody = await healthDocument.text();
              await json('evidence/health-document-response.json', {
                request: { url: base + '/index.html', followRedirects: false },
                response: {
                  status: healthDocument.status,
                  headers: Object.fromEntries(healthDocument.headers),
                  body: healthBody,
                  bodySha256: sha256(healthBody),
                },
              });
              expect(healthDocument.status).toBe(200);
              expect(healthDocument.headers.get('location')).toBeNull();
              expect(healthDocument.headers.get('content-type')).toContain('text/html');
              const root = await requestHttp(base + accessibilityEntryContract.root.path);
              const rootBody = await root.text();
              // Persist the actual owned response before evaluating its contract. Supertest
              // never follows this redirect, so the external presentation remains unrequested.
              await json('evidence/root-redirect.json', {
                request: { url: base + '/', followRedirects: false },
                expected: accessibilityEntryContract.root,
                response: {
                  status: root.status,
                  headers: Object.fromEntries(root.headers),
                  body: rootBody,
                  bodySha256: sha256(rootBody),
                },
              });
              expect(root.status).toBe(accessibilityEntryContract.root.status);
              expect(root.headers.get('location')).toBe(accessibilityEntryContract.root.location);
              for (const entry of accessibilityEntryContract.entries) {
                const response = await requestHttp(base + entry.path);
                const body = await response.text();
                await json(`evidence/entry-${entry.path.slice(1)}-response.json`, {
                  request: { url: base + entry.path, followRedirects: false },
                  response: {
                    status: response.status,
                    headers: Object.fromEntries(response.headers),
                    body,
                    bodySha256: sha256(body),
                  },
                });
                expect(response.status).toBe(200);
                expect(response.headers.get('location')).toBeNull();
                expect(response.headers.get('content-type')).toContain('text/html');
                const navigation = await view.goto(base + entry.path);
                await view.locator(entry.ready).filter({ visible: true }).first().waitFor();
                await json(`evidence/entry-${entry.path.slice(1)}-navigation.json`, {
                  request: base + entry.path,
                  documentStatus: navigation?.status(),
                  documentUrl: navigation?.url(),
                  finalUrl: view.url(),
                  ready: entry.ready,
                  expectedDestination: base + entry.destination,
                });
                expect(navigation?.status()).toBe(200);
                expect(navigation?.url()).toBe(base + entry.path);
                expect(view.url()).toBe(base + entry.destination);
              }
            });
          }
          if (discovery || partition === 'search' || details) {
            const screens = accessibilityScreens
              .filter((screen) =>
                discovery
                  ? screen.id === 'place'
                  : partition === 'search'
                    ? ['search', 'filters'].includes(screen.id)
                    : ['property', 'listing', 'privacy'].includes(screen.id),
              )
              .sort((left, right) => Number(right.id === 'place') - Number(left.id === 'place'));
            for (const screen of screens)
              for (const locale of accessibilityLocales.filter(
                (locale) =>
                  !(discovery || details) ||
                  partition.startsWith(`${discovery ? 'discovery' : 'details'}-${locale}-`),
              ))
                for (const width of accessibilityWidths.filter(
                  (width) => !(discovery || details) || partition.endsWith(`-${width}`),
                )) {
                  await enter(
                    screen.id === 'listing' ? `/listings/${listingId}` : screen.path,
                    locale,
                    width,
                    screen.ready,
                  );
                  if (screen.id === 'property')
                    expect(
                      await view
                        .locator('.property-source')
                        .evaluateAll((nodes) => nodes.map((node) => node.id)),
                    ).toEqual(
                      (await readProperty(base, preparedPropertyId(1))).property.listings.map(
                        (listing) => `property-listing-${listing.id}`,
                      ),
                    );
                  if (screen.id === 'search')
                    expect(
                      await view
                        .locator('.search-rows .prow')
                        .evaluateAll((nodes) =>
                          nodes.map((node) => node.getAttribute('href')?.split('?')[0]),
                        ),
                    ).toEqual(
                      (await readSearch(base, { placeId })).items.map(
                        (item) => `/properties/${item.id}`,
                      ),
                    );
                  await audit(`${screen.id}-default-${locale}-${width}`, 'A11Y-001', locale, width);
                  if (screen.disclosures) {
                    await openEvidence();
                    await audit(`${screen.id}-open-${locale}-${width}`, 'A11Y-001', locale, width);
                  }
                }
          }
          if (partition === 'keyboard') {
            for (const locale of accessibilityLocales)
              for (const width of accessibilityWidths) {
                await attempt('A11Y-002', `navigation-${locale}-${width}`, async () => {
                  await enter(`/places/${placeId}`, locale, width, '.place-key-figures');
                  await keyboardActivate('.public-skip');
                  expect(await view.evaluate(() => document.activeElement?.id)).toBe(
                    'public-content',
                  );
                  await keyboardActivate(
                    `.public-rail-navigation a[href="/search/${placeId}"], .public-tabs a[href="/search/${placeId}"]`,
                  );
                  await view.locator('#search-filters-link').waitFor();
                  await observeRouteFocus(
                    'public-content',
                    `route-focus-search-${locale}-${width}`,
                  );
                  await keyboardActivate('#search-filters-link');
                  await view.locator('#filter-place').waitFor();
                  await observeRouteFocus(
                    'filters-title',
                    `route-focus-filters-${locale}-${width}`,
                  );
                  await keyboardReach('#minArea');
                  expect(await view.evaluate(() => document.activeElement?.id)).toBe('minArea');
                  expect(await view.locator('#minArea').inputValue()).toBe('');
                  await view.keyboard.type('80');
                  await view
                    .locator('.search-filters__actions button[type="submit"]:enabled')
                    .waitFor();
                  await keyboardActivate('.search-filters__actions button[type="submit"]');
                  await view.waitForURL(`**/search/${placeId}?minArea=80`);
                  await observeRouteFocus(
                    'search-filters-link',
                    `route-focus-apply-${locale}-${width}`,
                  );
                  await keyboardActivate('#search-filters-link');
                  await view.locator('#filter-place').waitFor();
                  await keyboardActivate('.search-filters__actions button[type="button"]');
                  expect(await view.locator('#minArea').inputValue()).toBe('');
                  await keyboardActivate('.search-filters__head a');
                  await view.locator('#search-filters-link').waitFor();
                  expect(new URL(view.url()).searchParams.get('minArea')).toBe('80');
                  await observeRouteFocus(
                    'search-filters-link',
                    `route-focus-cancel-${locale}-${width}`,
                  );
                  await view.goBack();
                  await view.locator('#filter-place').waitFor();
                  await observeRouteFocus('filters-title', `route-focus-back-${locale}-${width}`);
                  await view.goForward();
                  await view.locator('#search-filters-link').waitFor();
                  await observeRouteFocus(
                    'search-filters-link',
                    `route-focus-forward-${locale}-${width}`,
                  );
                  await keyboardActivate('.search-chips .chip');
                  await view.waitForURL(`**/search/${placeId}`);
                  await expect.poll(() => view.locator('.search-chips .chip').count()).toBe(0);
                  const chipRemovalFocus = await view.evaluate(() => ({
                    tag: document.activeElement?.tagName,
                    id: document.activeElement?.id,
                    documentFocused: document.hasFocus(),
                  }));
                  await view.keyboard.press('Tab');
                  const nextAfterChip = await view.evaluate(() => ({
                    tag: document.activeElement?.tagName,
                    id: document.activeElement?.id,
                    documentFocused: document.hasFocus(),
                  }));
                  await json(`evidence/chip-removal-${locale}-${width}.json`, {
                    chipRemovalFocus,
                    nextAfterChip,
                    method:
                      'Native Tab reach and Enter removal; next Tab is observed without focus repair',
                  });
                  expect(nextAfterChip).toMatchObject({
                    id: 'search-sort',
                    documentFocused: true,
                  });
                  await keyboardActivate(publicPrivacyEntrySelector);
                  await view.locator('.privacy-source').first().waitFor();
                  const anchor = view.locator('.privacy-contents a').first();
                  const href = await anchor.getAttribute('href');
                  await keyboardActivate(`a[href="${href}"]`);
                  expect(new URL(view.url()).hash).toBe(href);
                  await view.goBack();
                  expect(new URL(view.url()).hash).toBe('');
                  await json(`evidence/navigation-${locale}-${width}.json`, {
                    filtersRouteNotModal: true,
                    applyContextRetained: true,
                    clearCancelled: true,
                    backForward: true,
                    documentAnchor: href,
                    inputEditing:
                      'Native Tab reach, verified focus, keyboard typing; locale/route enter are preparation before the journey',
                    focus: await view.evaluate(() => document.activeElement?.id),
                  });
                });
              }
          }
          if (details) {
            for (const locale of accessibilityLocales.filter((locale) =>
              partition.startsWith(`details-${locale}-`),
            ))
              for (const width of accessibilityWidths.filter((width) =>
                partition.endsWith(`-${width}`),
              ))
                await attempt('A11Y-002', `property-source-anchor-${locale}-${width}`, async () => {
                  await enter(
                    `/properties/${preparedPropertyId(1)}`,
                    locale,
                    width,
                    '.property-basis',
                  );
                  const href = `#property-listing-${listingId}`;
                  await keyboardActivate(`.property-lifelines .life > a[href="${href}"]`);
                  expect(new URL(view.url()).hash).toBe(href);
                  expect(await view.evaluate(() => document.activeElement?.id)).toBe(href.slice(1));
                  expect(
                    await view
                      .locator(href)
                      .evaluate((element) => !element.closest('details:not([open])')),
                  ).toBe(true);
                  await view.goBack();
                  expect(new URL(view.url()).hash).toBe('');
                  await json(`evidence/property-source-anchor-${locale}-${width}.json`, {
                    href,
                    nativeEnter: true,
                    openAndFocused: true,
                    backClearedHash: true,
                  });
                });
          }
          async function inspect(state: AskState) {
            await view.locator('#ask-state').selectOption(state);
            if (state === 'queued') await keyboardActivate('.ask-inspection button');
            await expect
              .poll(() => view.locator('.ask-record__head h2').textContent())
              .toBe(runs.get(state)!.question);
            await expect
              .poll(() => view.locator('.ask-record__head time').getAttribute('datetime'))
              .toBe(runs.get(state)!.updatedAt);
            const expectedRun = runs.get(state)!;
            expect(await view.locator('.ask-identifiers dd').first().textContent()).toBe(
              expectedRun.id,
            );
            expect(await view.locator('.ask-identifiers dd').nth(1).textContent()).toBe(
              expectedRun.threadId,
            );
            expect(
              await view
                .locator('.ask-record__steps li time')
                .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('datetime'))),
            ).toEqual(expectedRun.steps.map((step) => step.at));
            if (expectedRun.result?.kind === 'price_per_square_meter') {
              const locale = await view.locator('html').getAttribute('lang');
              const normalizeMoney = (value: string) =>
                value.replace(/[\u00a0\u202f]/g, ' ').replace(/^R\$\s*/, 'R$ ');
              const expectedMoney = normalizeMoney(
                new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }).format(expectedRun.result.minorUnits / 100),
              );
              expect(
                normalizeMoney(
                  await view.locator('.ask-record .fig__value').evaluate((node) =>
                    Array.from(node.childNodes)
                      .filter((child) => child.nodeType === Node.TEXT_NODE)
                      .map((child) => child.textContent)
                      .join('')
                      .trim(),
                  ),
                ),
              ).toBe(expectedMoney);
            } else expect(await view.locator('.ask-record .fig__value').count()).toBe(0);
          }
          if (partition.startsWith('ask-')) {
            for (const locale of accessibilityLocales.filter(
              (locale) => partition === `ask-${locale}`,
            ))
              for (const width of accessibilityWidths) {
                await enter(`/ask/${placeId}`, locale, width, '#ask-draft');
                await audit(`ask-idle-${locale}-${width}`, 'A11Y-004', locale, width);
                for (const state of ASK_STATES) {
                  await inspect(state);
                  await audit(`ask-${state}-${locale}-${width}`, 'A11Y-004', locale, width);
                  await openEvidence();
                  await audit(`ask-${state}-open-${locale}-${width}`, 'A11Y-004', locale, width);
                }
                await inspect('awaiting_confirmation');
                await view.locator('#ask-price').fill(privateMarker);
                await view.locator('#ask-area').fill('invalid');
                await view.locator('#ask-draft').fill(privateMarker);
                await keyboardActivate('.ask-confirmation__actions button:last-child');
                expect(await view.evaluate(() => document.activeElement?.id)).toBe('ask-draft');
                await audit(`ask-local-operands-${locale}-${width}`, 'A11Y-004', locale, width);
                await keyboardActivate('.ask-confirmation__actions button:first-child');
                expect(await view.locator('#ask-price').inputValue()).toBe('800000');
                await view.locator('#ask-price').fill('123');
                const run = runs.get('awaiting_confirmation')!;
                const recorded = frames.get('awaiting_confirmation')!;
                const pattern = `${base}/api/v1/runs/${run.id}/events`;
                const cursors: Array<string | undefined> = [];
                await view.route(pattern, async (route) => {
                  cursors.push(route.request().headers()['last-event-id']);
                  if (cursors.length === 1) {
                    const first = recorded[0]!;
                    await route.fulfill({
                      contentType: 'text/event-stream',
                      body: `id: ${first.id}\nevent: ${first.event}\ndata: ${JSON.stringify(first)}\n\ndata: incomplete\n\n`,
                    });
                  } else await route.continue();
                });
                await preserveCleanup(
                  async () => {
                    await keyboardActivate('.ask-preview button');
                    await view.getByRole('alert').waitFor();
                    expect(await view.locator('.ask-record .fig__value').count()).toBe(0);
                    await audit(`ask-interrupted-${locale}-${width}`, 'A11Y-004', locale, width);
                    await keyboardActivate('.ask-screen .system-error > button.btn--primary');
                    await expect
                      .poll(() => view.locator('.ask-record .fig__value').textContent())
                      .toMatch(/9[.,]000[.,]00/);
                    expect(cursors).toEqual([undefined, recorded[0]!.id]);
                    expect(await view.locator('#ask-price').inputValue()).toBe('123');
                    expect(await view.locator('#ask-draft').inputValue()).toBe(privateMarker);
                    expect(
                      await view.evaluate(() => ({
                        local: Object.entries(localStorage),
                        session: Object.entries(sessionStorage),
                        url: location.href,
                      })),
                    ).toEqual({
                      local: [['rei.locale', locale]],
                      session: [],
                      url: `${base}/ask/${placeId}`,
                    });
                    expect(diagnosticLeak).toBe(false);
                    await json(`evidence/ask-recorded-continuation-${locale}-${width}.json`, {
                      cursors,
                      expected: recorded.at(-1)!.run,
                      localOperandsAccepted: false,
                      privateUrlStorageDiagnostics: false,
                    });
                    await openEvidence();
                    await audit(
                      `ask-recorded-completed-${locale}-${width}`,
                      'A11Y-004',
                      locale,
                      width,
                    );
                  },
                  async () => {
                    await view.unroute(pattern);
                    await view.locator('#ask-draft').fill('');
                  },
                );
              }
          }
          if (partition.startsWith('recovery-')) {
            for (const locale of accessibilityLocales.filter((locale) =>
              partition.startsWith(`recovery-${locale}-`),
            ))
              for (const width of accessibilityWidths.filter((width) =>
                partition.endsWith(`-${width}`),
              )) {
                await enter(`/search/${placeId}?minArea=999999`, locale, width, '.search-empty');
                await audit(`search-empty-${locale}-${width}`, 'A11Y-003', locale, width);
                await enter(
                  `/search/${placeId}?minArea=invalid`,
                  locale,
                  width,
                  'main [role="alert"]',
                );
                await audit(`search-invalid-query-${locale}-${width}`, 'A11Y-003', locale, width);
                await enter(`/search/${placeId}?view=filters`, locale, width, '#minArea');
                await view.locator('#minArea').fill('999');
                await view.locator('#maxArea').fill('1');
                await view.locator('#draft-error').waitFor();
                expect(await view.locator('#minArea').getAttribute('aria-describedby')).toBe(
                  'draft-error',
                );
                await audit(`filters-invalid-range-${locale}-${width}`, 'A11Y-003', locale, width);
                for (const fault of [
                  {
                    id: 'place',
                    path: `/places/${placeId}`,
                    api: `/api/v1/places/${placeId}/market`,
                    region: '.place-median',
                  },
                  {
                    id: 'search',
                    path: `/search/${placeId}`,
                    api: '/api/v1/properties?*',
                    region: '.search-body',
                  },
                  {
                    id: 'filters-preview',
                    path: `/search/${placeId}?view=filters`,
                    api: '/api/v1/properties?*',
                    region: '.search-filters',
                  },
                  {
                    id: 'ask-catalogue',
                    path: `/ask/${placeId}`,
                    api: '/api/v1/ask/fixtures',
                    region: 'main',
                  },
                  {
                    id: 'property',
                    path: `/properties/${preparedPropertyId(1)}`,
                    api: `/api/v1/properties/${preparedPropertyId(1)}`,
                    region: 'main',
                  },
                  {
                    id: 'listing',
                    path: `/listings/${listingId}`,
                    api: `/api/v1/listings/${listingId}`,
                    region: 'main',
                  },
                  {
                    id: 'privacy',
                    path: '/privacy',
                    api: '/api/v1/collection/sources',
                    region: 'main',
                  },
                ]) {
                  const pattern = `${base}${fault.api}`;
                  const response = await requestHttp(
                    fault.api.endsWith('*')
                      ? `${base}/api/v1/properties?placeId=${placeId}`
                      : pattern,
                  );
                  expect(response.status).toBe(200);
                  const bytes = await response.text();
                  const faultRead = await holdAccessibilityRead(view, pattern, bytes);
                  await preserveCleanup(
                    async () => {
                      await enter(
                        fault.path,
                        locale,
                        width,
                        fault.id === 'filters-preview'
                          ? '.search-filters__actions button[type="submit"]:disabled'
                          : fault.id === 'ask-catalogue'
                            ? '#ask-draft'
                            : `${fault.region} [role="status"]`,
                      );
                      if (fault.id === 'ask-catalogue') {
                        await keyboardActivate('.ask-inspection button');
                        await view.locator('.ask-session-status').waitFor();
                      }
                      await settleUnaffected(fault.region);
                      // Capture the actual held loading state before allowing error/recovery.
                      await auditPair(
                        `${fault.id}-loading-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      faultRead.setMode('refused');
                      await view.locator(`${fault.region} [role="alert"]`).first().waitFor();
                      await expect
                        .poll(() => view.locator(`${fault.region} .system-loading`).count())
                        .toBe(0);
                      await auditPair(
                        `${fault.id}-refused-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts(fault.region, faultRead, 'malformed');
                      await view.locator(`${fault.region} [role="alert"]`).first().waitFor();
                      await auditPair(
                        `${fault.id}-malformed-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts(fault.region, faultRead, 'valid');
                      await expect
                        .poll(() => view.locator(`${fault.region} [role="alert"]`).count())
                        .toBe(0);
                      if (fault.id === 'ask-catalogue') {
                        await view.locator('.ask-record').waitFor();
                        await view.locator('.ask-follow button:enabled').waitFor();
                      }
                      await auditPair(
                        `${fault.id}-recovered-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await json(
                        `evidence/${fault.id}-recovery-transport-${locale}-${width}.json`,
                        {
                          delivered: faultRead.delivered,
                          responseSource: 'Actual admitted HTTP bytes, refusal or truncation only',
                        },
                      );
                    },
                    async () => {
                      await drainFault(
                        faultRead,
                        `evidence/${fault.id}-fault-lifecycle-${locale}-${width}.json`,
                      );
                    },
                  );
                }
              }
          }
          if (partition.startsWith('retained-')) {
            for (const locale of accessibilityLocales.filter((locale) =>
              partition.startsWith(`retained-${locale}-`),
            ))
              for (const width of accessibilityWidths.filter((width) =>
                partition.endsWith(`-${width}`),
              )) {
                for (const screen of [
                  {
                    id: 'place',
                    path: `/places/${placeId}`,
                    api: `/api/v1/places/${placeId}/market`,
                    ready: '.place-key-figures',
                  },
                  {
                    id: 'property',
                    path: `/properties/${preparedPropertyId(1)}`,
                    api: `/api/v1/properties/${preparedPropertyId(1)}`,
                    ready: '.property-basis',
                  },
                  {
                    id: 'listing',
                    path: `/listings/${listingId}`,
                    api: `/api/v1/listings/${listingId}`,
                    ready: '.listing-values',
                  },
                  {
                    id: 'privacy',
                    path: '/privacy',
                    api: '/api/v1/collection/sources',
                    ready: '.privacy-source',
                  },
                ].filter((screen) => partition === `retained-${locale}-${screen.id}-${width}`)) {
                  await enter(screen.path, locale, width, screen.ready);
                  const retainedSelector = {
                    place: '.place-key-figures .fig__value, .place-median .place-unavailable',
                    property: '.property-head h1, .property-prices .fig__value, .property-source',
                    listing:
                      '.listing-head h1, .listing-asking .fig__value, .listing-values tbody tr',
                    privacy: '.privacy-source',
                  }[screen.id]!;
                  const retainedFacts = () => view.locator(retainedSelector).allTextContents();
                  const baseline = await retainedFacts();
                  expect(baseline.length).toBeGreaterThan(0);
                  if (screen.id === 'property')
                    await checkProperty(
                      view,
                      await readProperty(base, preparedPropertyId(1)),
                      locale,
                    );
                  if (screen.id === 'listing') {
                    const expected = await readListing(base, listingId);
                    await checkListing(
                      view,
                      expected,
                      await readListingContext(base, expected),
                      locale,
                    );
                  }
                  if (screen.id === 'privacy') {
                    const sources = parseEnabledSourcesResponse(
                      await (await requestHttp(base + screen.api)).json(),
                    );
                    expect(await view.locator('.privacy-source h3').allTextContents()).toEqual(
                      sources.sources.map((source) => source.displayLabel),
                    );
                    for (const [index, source] of sources.sources.entries())
                      expect(baseline[index]).toContain(source.sourceId);
                  }
                  if (screen.id === 'place') {
                    const market = parsePlaceMarketResponse(
                      await (await requestHttp(base + screen.api)).json(),
                    );
                    const median = market.figures.medianAskingPricePerSquareMeter;
                    if (median.state === 'available')
                      expect(
                        (await view.locator('.place-median .fig__value').textContent())?.replace(
                          /\u00a0/g,
                          ' ',
                        ),
                      ).toBe(`${propertyMoney(median.value.minorUnits, locale, false)} /m²`);
                    else {
                      expect(await view.locator('.place-median .fig__value').count()).toBe(0);
                      expect(await view.locator('.place-median .place-unavailable').count()).toBe(
                        1,
                      );
                    }
                  }
                  await json(`evidence/${screen.id}-retained-baseline-${locale}-${width}.json`, {
                    selector: retainedSelector,
                    facts: baseline,
                    oracle: 'fixtures/oracles.json',
                  });
                  const assertRetained = async (state: string) => {
                    const observed = await retainedFacts();
                    await json(
                      `evidence/${screen.id}-retained-facts-${state}-${locale}-${width}.json`,
                      {
                        selector: retainedSelector,
                        expected: baseline,
                        observed,
                      },
                    );
                    expect(observed).toEqual(baseline);
                  };
                  const readyAt = Date.now();
                  const pattern = `${base}${screen.api}`;
                  const bytes = await (await requestHttp(pattern)).text();
                  const faultRead = await holdAccessibilityRead(view, pattern, bytes);
                  await preserveCleanup(
                    async () => {
                      const href = screen.id === 'privacy' ? '/search' : `/search/${placeId}`;
                      await keyboardActivate(
                        `.public-rail-navigation a[href="${href}"], .public-tabs a[href="${href}"]`,
                      );
                      await view.waitForURL(`**/search/${placeId}`);
                      await view.locator('.search-rows li').first().waitFor();
                      // The production readPolicy is staleTime=30s. Observe genuine elapsed
                      // time since the completed read, without patching Date/RAF/CSS paint.
                      await expect
                        .poll(() => Date.now() - readyAt, { timeout: 32_000 })
                        .toBeGreaterThan(30_000);
                      await view.goBack();
                      await view.locator(screen.ready).filter({ visible: true }).first().waitFor();
                      await expect.poll(() => faultRead.requested.length).toBe(1);
                      await assertRetained('refresh');
                      await auditPair(
                        `${screen.id}-retained-refresh-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      faultRead.setMode('refused');
                      await view.getByRole('alert').first().waitFor();
                      await assertRetained('error');
                      await auditPair(
                        `${screen.id}-retained-error-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts('main', faultRead, 'malformed');
                      await assertRetained('malformed');
                      await auditPair(
                        `${screen.id}-retained-malformed-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts('main', faultRead, 'valid');
                      await expect.poll(() => view.getByRole('alert').count()).toBe(0);
                      await assertRetained('recovered');
                      await auditPair(
                        `${screen.id}-retained-recovered-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await json(
                        `evidence/${screen.id}-retained-cache-age-${locale}-${width}.json`,
                        {
                          method: 'Uninstrumented real time after the completed production read',
                          staleTimeMilliseconds: 30_000,
                          readyAt,
                          observedAt: Date.now(),
                          clockInstrumentation: false,
                          apiBytesAltered: false,
                        },
                      );
                    },
                    async () => {
                      await drainFault(
                        faultRead,
                        `evidence/${screen.id}-retained-lifecycle-${locale}-${width}.json`,
                      );
                    },
                  );
                }
                if (partition === `retained-${locale}-search-${width}`) {
                  // Search intentionally discards visit pagination (gcTime=0). Its supported retained
                  // evidence state is a failed next cursor page, not history of an obsolete visit.
                  const query = { placeId: 'sao-paulo', pageSize: 1 };
                  const first = await readSearch(base, query);
                  expect(first.nextCursor).not.toBeNull();
                  const next = await readSearch(base, { ...query, cursor: first.nextCursor! });
                  await enter('/search/sao-paulo?pageSize=1', locale, width, '.search-rows li');
                  await checkSearchRows(view, first, locale);
                  await view.locator('.search-count').waitFor();
                  const count = await view.locator('.search-count').textContent();
                  const nextBytes = await (
                    await requestHttp(
                      `${base}/api/v1/properties?${searchParameters({ ...query, cursor: first.nextCursor! })}`,
                    )
                  ).text();
                  const faultRead = await holdAccessibilityRead(
                    view,
                    `${base}/api/v1/properties?*cursor=*`,
                    nextBytes,
                  );
                  // The malformed body is a truncation of the actual independently admitted response.
                  await preserveCleanup(
                    async () => {
                      await keyboardActivate('.search-more button');
                      await view.locator('.search-more button:disabled').waitFor();
                      await checkSearchRows(view, first, locale);
                      expect(await view.locator('.search-count').textContent()).toBe(count);
                      await auditPair(
                        `search-retained-cursor-loading-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      faultRead.setMode('refused');
                      await view.locator('.search-next-error [role="alert"]').waitFor();
                      await checkSearchRows(view, first, locale);
                      expect(await view.locator('.search-count').textContent()).toBe(count);
                      await auditPair(
                        `search-retained-cursor-refused-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts('.search-next-error', faultRead, 'malformed');
                      await checkSearchRows(view, first, locale);
                      expect(await view.locator('.search-count').textContent()).toBe(count);
                      await auditPair(
                        `search-retained-cursor-malformed-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await retryAlerts('.search-next-error', faultRead, 'valid');
                      await checkSearchRows(
                        view,
                        { ...first, items: [...first.items, ...next.items] },
                        locale,
                      );
                      expect(await view.locator('.search-count').textContent()).toBe(count);
                      await auditPair(
                        `search-retained-cursor-recovered-${locale}-${width}`,
                        'A11Y-003',
                        locale,
                        width,
                      );
                      await json(`evidence/search-retained-cursor-oracle-${locale}-${width}.json`, {
                        first,
                        next,
                        count,
                        method:
                          'Independent parsed real cursor response, exact identities/order/count retained through held/503/truncation and appended only after native manual retry',
                      });
                    },
                    async () => {
                      await drainFault(
                        faultRead,
                        `evidence/search-retained-cursor-lifecycle-${locale}-${width}.json`,
                      );
                    },
                  );
                }
              }
          }
          if (partition.startsWith('adaptation-')) {
            for (const locale of accessibilityLocales.filter(
              (locale) => partition === `adaptation-${locale}`,
            )) {
              for (const screen of accessibilityScreens) {
                const path = screen.id === 'listing' ? `/listings/${listingId}` : screen.path;
                await enter(path, locale, 320, screen.ready);
                if (screen.disclosures) await openEvidence();
                await audit(`${screen.id}-reflow-${locale}-320`, 'A11Y-005', locale, 320);
                if (screen.id === 'ask')
                  for (const state of ASK_STATES) {
                    await inspect(state);
                    await openEvidence();
                    await audit(`ask-${state}-reflow-${locale}-320`, 'A11Y-005', locale, 320);
                  }
                await view.setViewportSize({ width: 1440, height: 1142 });
                await view.goto(base + path);
                const zoom = await setNativeZoom(context!, view, base + path, '2');
                await view.locator(screen.ready).filter({ visible: true }).first().waitFor();
                await json(`evidence/${screen.id}-zoom-${locale}.json`, zoom);
                expect(zoom.selected).toBe('2');
                expect(zoom.after.dpr).toBe(zoom.before.dpr * 2);
                expect(zoom.after.width).toBe(zoom.before.width / 2);
                expect(zoom.after.font).toBe(zoom.before.font);
                if (screen.disclosures) await openEvidence();
                await audit(`${screen.id}-zoom-${locale}-720`, 'A11Y-005', locale, 720);
                if (screen.id === 'ask')
                  for (const state of ASK_STATES) {
                    await inspect(state);
                    await openEvidence();
                    await audit(`ask-${state}-zoom-${locale}-720`, 'A11Y-005', locale, 720);
                  }
                await setNativeZoom(context!, view, base + path, '1');
              }
            }
          }
          await attempt('A11Y-006', 'boundaries', async () => {
            expect(outside).toEqual([]);
            expect(forbidden).toEqual([]);
            expect(diagnosticLeak).toBe(false);
            const after = await askDatabaseState(connection!);
            expect(after).toEqual(before);
            await json('sql-effects.json', { before, after, unchanged: true });
            await json('read-only-boundaries.json', { reads, outside, forbidden });
            await json('results/matrix.json', {
              partition,
              cells,
              layoutsAreVariants: true,
              boundaries: accessibilityBoundaries,
            });
          });
        } catch (error) {
          // Navigation/readiness/disclosure setup must leave a failed executor receipt too.
          // Do not duplicate a failure already preserved by its original scenario attempt.
          if (error !== recordedFailure)
            await attempt('A11Y-006', 'executor-preparation', async () => {
              throw error;
            });
          throw error;
        }
      },
      campaign,
      {
        release: [
          async () => {
            // Failure paths must retain the same independent no-write proof as successful paths.
            if (connection && before) {
              const after = await askDatabaseState(connection);
              await json('sql-final-readback.json', {
                before,
                after,
                unchanged: JSON.stringify(after) === JSON.stringify(before),
                reads,
                outside,
                forbidden,
                diagnosticLeak,
              });
              expect(after).toEqual(before);
              expect(outside).toEqual([]);
              expect(forbidden).toEqual([]);
              expect(diagnosticLeak).toBe(false);
            }
          },
          async () => context?.close(),
          async () => connection?.close(),
        ],
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
        report: async (receipt) => {
          await json('teardown.json', { project, ...receipt });
          await json('campaign.json', campaign);
          const ledger = 'results/attempts.jsonl';
          manifest.push({
            file: ledger,
            sha256: sha256(await readFile(new URL(ledger, directory))),
          });
          const feature = 'catalog/accessibility.feature';
          manifest.push({
            file: feature,
            sha256: sha256(await readFile(new URL(feature, directory))),
          });
          await writeAccessibilityEvidence(directory, 'surfaces.json', { files: manifest });
        },
      },
    );
  }

  for (const partition of accessibilityPartitions) {
    const title = partition;
    const steps = accessibilityExecutionSteps(partition);
    if (!steps) {
      test(title, () => runAccessibilityPartition(partition), 600_000);
      continue;
    }
    describe.sequential(title, () => {
      const execution = accessibilitySteps();
      let ownedBase = '';
      // The global hook resets allowed hosts before every native test. Re-admit only this
      // fixture's public origin; preparation allocates/registers its other owned endpoints.
      beforeEach(() => {
        if (ownedBase) allowOwnedEndpoint(ownedBase);
      });
      test(
        'owned fixture preparation',
        () =>
          execution.start((checkpoint) =>
            runAccessibilityPartition(partition, checkpoint, (base) => {
              ownedBase = base;
            }),
          ),
        300_000,
      );
      for (const step of steps) test(step, () => execution.advance(step), 600_000);
      test('boundaries and owned cleanup', () => execution.finish(), 300_000);
      // Bail or a failed state still reaches the existing independent owned teardown.
      afterAll(() =>
        preserveCleanup(
          async () => {
            guardNetwork();
            if (ownedBase) allowOwnedEndpoint(ownedBase);
            await execution.finish();
          },
          async () => finishNetwork(),
        ),
      );
    });
  }
});
