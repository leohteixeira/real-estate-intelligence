---
title: 'Privacy notice'
type: 'feature'
ticket: '10'
created: '2026-10-22'
status: 'built'
baseline_revision: 'c7e2688adaf427116024d31726b753b7181fed5c'
route: 'full'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: ['quick']
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/CLAUDE.md
  - /workspace/repos/real-estate-intelligence/AGENTS.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0020-vitest-integration-standard.md
  - /workspace/repos/real-estate-intelligence/apps/web/DESIGN.md
  - /workspace/repos/real-estate-intelligence/apps/web/.impeccable/surfaces/src-privacy-privacynotice-tsx.md
  - /home/vscode/.codex/skills/impeccable-v2/SKILL.md
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-28 has no public bilingual notice or footer entry. Visitors cannot inspect data,
sources/licences, retention, rights or the missing public controller/contact configuration.

**Approach:** D-069 builds `/privacy` from existing Placa components and the enabled-sources API.
Publish factual policy and explicit current limitations; optional public build configuration must
never fabricate a controller, licence, contact channel, legal approval or working erasure system.

## Boundaries & Constraints

**Always:** PT/EN, read-only `/api/v1`, validated unknown JSON, ten-second abortable whole-read
deadline, existing Query policy/no automatic retry, retained evidence/manual recovery. Every UX
must-show section: collected fields, sources/licences/attribution, purpose, legal basis, retention,
rights, removal, controller/contact. Label synthetic scope; preserve ADR0014/0015/0025 and D-019.
No blanket anonymity, thirty-day deletion or ZDR/local-storage claim. Explicit unresolved retention
and real-processing gates. Actual source display labels supply attribution; GeoSampa only if used.
Public identity/contact from configuration only; absent/invalid means explicit unavailable, no
mailto. Existing Placa/Barlow, 65–75ch prose, 16/24px gutters, 44px targets, 390/960/1440, keyboard
and complete locale text. No place plate/hierarchy/geography query/current tab on the document.
Link landing plus shell phone footer and desktop rail foot. Strict TypeScript native Vitest,
Supertest/Testcontainers-owned real local services and Playwright; retain all gates/coverage/hooks.

**Never:** Enable real collection, POST/form/erasure command, provider call, protected/V2 screen,
VPS/deploy/push, secret-file read, invented identity/attribution/permission/retention. No Node
test/assert, custom assertions, fetch/process/port harness in integration; no global design drift
repair, artboard rewrite, new visual world, shipping raster, commit by implementer or out-of-repo
edit. Parent owns bounded visual inspection/reviewer/documenter; implementer does not run detector,
concept/context, visual polish loops or finish agents. No dependency addition is expected.

## I/O & Edge-Case Matrix

| Scenario      | Input / State                                        | Expected Output / Behavior                                                       | Error Handling                                          |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Document      | Direct route, PT/EN                                  | All sections, contents links, title/lang; no geographic context                  | Static policy survives source failure                   |
| Sources       | Actual enabled list; three licence branches          | Every public label/licence exactly; safe link only licensed                      | No static fallback/candidate or invented credit         |
| Empty         | Valid sources empty                                  | Honest no enabled sources; policy readable                                       | Not a transport failure                                 |
| Read failure  | Non-OK/malformed/stalled response/body, cancellation | Safe bounded failure/manual retry; keep admitted cached facts with stale warning | No raw payload, retry loop or old request winning       |
| Configuration | Valid synthetic identity/contact or absent/invalid   | Safe plain text and validated mailto, or explicit missing gate                   | No invented identity, header injection or false channel |
| Navigation    | Landing/Places/Search/Property/Listing/Ask footer    | Privacy reachable, locale retained, back/reload work                             | No false current place or unintended read/write         |
| Boundaries    | Real synthetic local stack/browser                   | Exact API oracle, no SQL mutation/external traffic, owned cleanup                | Preserve primary and cleanup failures                   |

</intent-contract>

## Code Map

- `packages/contracts/src/collection/enabled-source.dto.ts` and `collection/index.ts`: existing
  `EnabledSourcesResponse`, three licence discriminators, true enabled and boolean permissions.
  Add/export strict parser here (and top-level index if needed), with isolated tests; reject
  duplicate identities/unsafe licence URLs. No backend module/domain change required.
- `apps/web/src/api/client.ts`, `places/place-queries.ts`: reuse parsed GET and `ApiReadError`,
  existing `readPolicy`; focused privacy client/query wrapper bounds entire body/parse read like
  `readListingProperty`, cancellation cleans listeners/timers. Never create an integration fetch.
- `apps/web/src/config.ts`: add `VITE_PRIVACY_CONTROLLER_NAME` and
  `VITE_PRIVACY_CONTACT_EMAIL` optional public values, safe defaults/validation; unit-test.
- `docker/web.Dockerfile`, `compose.yaml` web.build: explicit public build arguments, not runtime
  environment for static Vite. Do not read `.env*`; test identity is labelled synthetic.
- `src/routes.tsx`, `shell/AppShell.tsx`: document route can reuse shell with explicit no-place
  mode; publicRoutes remains exactly three geographic destinations. Footer link in both locations.
- `src/landing/{LandingPage.tsx,copy.ts,landing.css}`: actual localized internal footer link,
  > =44px/focus; preserve landing/WebGL behavior and shared locale.
- `src/privacy/*`, `src/styles/privacy.css`, `src/main.tsx`, `places/{resources,locale}.ts`:
  readable article/contents, full localized policy and source states; namespace parity. Existing
  `shared/SystemStates.tsx` supports sanitized failures/manual recovery.
- Policy sources: UX Privacy notice; `specs/adrs/0014-zero-data-retention-for-user-text-routes.md`,
  `0015-handling-of-collected-data.md`, `0025-run-scoped-remote-graph-checkpoints.md`;
  `docs/privacy/{record-of-processing-operations,legitimate-interest-assessment}.md`.
  Real snapshot expiry differs from normalized history; checkpoint payload expiry differs from
  terminal runs/receipts/SSE/events. Removal policy is not an implemented public mutation.
- `integration/support/{fixture,http,accessibility,property-capture,search-campaign,ask-campaign}.ts`
  and `web-ask-states.integration.test.ts`: owned production stack/evidence patterns. Reuse generic
  Docker/SQL inventory from ask-web-evidence if useful, not Ask-specific capture selectors.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/collection/*` — strict public parser and complete branch tests.
- [x] `apps/web/src/{config,privacy/*}` — configuration/read/state/component tests and implementation.
- [x] `apps/web/src/{routes.tsx,shell/*,landing/*,places/*,styles/privacy.css,main.tsx}` — integrate
      notice, complete PT/EN, both footer locations, route/title/lang and no-place mode regressions.
- [x] `docker/web.Dockerfile`, `compose.yaml` — public build injection plus absent-safe defaults.
- [x] `integration/web-privacy.integration.test.ts`, focused support as needed — actual independent
      Supertest oracle and owned Chromium at six size/locales, all public entry links, direct/reload/
      back/forward, config present/absent, source empty/fault/retry, keyboard/focus/axe/overflow/fonts.
      Record scenario ledger, source/build/runtime asset hashes, SQL before/after, request boundary,
      manifest/capture hashes and owned/foreign teardown. Capture notice top/full and relevant
      footer states under `.impeccable/review/`; compare unchanged incumbent Components/Main/desktop
      shell references, not an invented Privacy artboard. Fault routes only use actual oracle bytes.
- [x] Parent — independently read diff, execute all verification/matrix audit, at most two batched
      visual rounds/one detector then fresh finish reviewer/documenter; BMAD review and four commits.

**Acceptance Criteria:**

- Given the real owned stack, when opening Privacy from every public screen in either locale,
  then the complete readable document and actual enabled source/licence evidence are reachable
  on phone and desktop, without a plate, geographic query or fake current destination.
- Given absent publication configuration, when reading controller/removal, then the absence and
  real-processing restriction are clear; given safe synthetic configured values, the exact name
  and working mailto appear without any real identity committed or external request sent.
- Given the incumbent component references and final captures, when the fresh visual reviewer
  assesses the documented scope, then the required finite finish and documentation handoffs complete.

## Implementation Notes

- Full route: expected >100 lines and >5 meaningful files; medium risk, pinned quick review.
  D-069 recorded before code. Parent already invoked Impeccable context this session; do not rerun.
  Read required playbook/craft floor before UI changes. Parent owns acceptance/commits; no questions.
- Source-branch verification preserves the existing database gates: an enabled synthetic source
  must have a `not-applicable` licence; an enabled `not-verified` source is forbidden, and obtaining
  an enabled `licensed` oracle would require enabling a real source. No gate is bypassed and no
  real source is enabled. All three closed discriminator branches and exact permission rendering
  are covered in `enabled-source.dto.test.ts` and `PrivacyNotice.test.tsx`; the owned browser
  campaign uses actual synthetic-enabled and empty API oracle bytes. This is the accepted test
  mapping for the plan's explicit no-real-enablement boundary, not a fabricated HTTP fixture.

## Plan Change Log

## Review Triage Log

### 2026-10-22 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free quick lens read all 248 diff blocks, audited 96 JSON/JSONL
  evidence objects and 118 PNG metadata entries, and independently matched all 22 source hashes
  and 49 final manifest entries. No patch, rejection, deferral or loopback is required.

### 2026-10-22 — Finalization verification correction

The unchanged Markdown hook rejected the first documentation commit attempt because generated
campaign report prose exceeded 100 characters. The original implementer wrapped the generator's
prose and the two successful reports without changing wording or behavior. Targeted ESLint and
Markdown lint passed. This is a hook-discovered artifact-format correction, not an additional lens
finding or visual fix. It has a separate test commit (`f63e338`), never an amend or bypass. Root
gates, coverage and production campaign are rerun after it. All 49 evidence hashes in each existing
successful campaign still match after the hook's JSON formatting. No product source changed.

The first revalidation incorrectly overlapped the root gates, full coverage and Chromium campaign.
Under that contention, five web unit cases timed out in the root test command; coverage had 22
web failures, predominantly the same five-second deadline. CPU pressure was observed, with no
memory OOM or cgroup throttling. These failed commands are not counted as passing verification.
The production campaign still completed and cleaned up successfully. After it and coverage had
finished, the exact root command ran alone and passed all 2,703 tests and the build, without any
test, assertion, timeout, retry, worker setting, coverage floor or product-source change. Coverage
then ran separately and passed all eight workspaces with every floor unchanged; web retained
96.37% statements, 90.94% branches, 96.97% functions and 97.54% lines. This corrects suite
orchestration, not application behavior.

## Design Notes

Existing code-led Placa extension, Read mode; exact UX document exception/no artboard wins over
old blanket plate statements. Brief fixes first viewport and native contents navigation; no new
system tokens. Global system files preserved. Identity absent is an explicit release gate, not
a fabricated legal contact. All policy language is the already accepted engineering baseline.

## Verification

Implementer evidence (independently confirmed below; finish handoffs recorded when complete):

- Focused web Vitest: 73 passed across privacy/client/config/shell/locale/landing layout. Contracts
  enabled-source parser: 32 passed. Workspace-specific runners preserve the incumbent web fixture
  configuration; a root direct Vitest invocation is not equivalent to the web package test command.
- `pnpm --filter @rei/web typecheck`, `pnpm run typecheck:integration`, focused ESLint and changed-file
  Prettier checks passed. `pnpm run build` passed with the incumbent large-chunk warning unchanged.
- Owned campaign passed: `privacy-2026-10-22T12-16-31-739Z-c352ebf3`, six distinct scenario groups,
  six responsive/locale combinations and 24 public-entry/history combinations. Structural ledger
  audit reports six approved, zero executor errors, zero unexecuted and no integrity errors.
  Evidence is under `apps/web/.impeccable/review/campaigns/`; top/full/reference captures also live
  in the review root. `version-absent.json` and `version-configured.json` identify the two explicit
  configuration builds and aggregate `privacySourceHash`; SQL, network and surface manifests are
  recorded independently. Teardown confirmed owned removal and foreign preservation at
  `2026-10-22T12:18:06.411Z`. Earlier executor-assumption failures are preserved as separate runs.
- `pnpm run test:integration:list` discovers the privacy campaign. No full integration suite,
  parent visual acceptance, detector or finish agents were run by the implementer.

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — exact root gates pass.
- `pnpm run test:coverage` — existing per-workspace floors unchanged and passing.
- `pnpm exec vitest run --config vitest.integration.config.ts integration/web-privacy.integration.test.ts`
  — real HTTP/owned Compose/Chromium campaign passes, fresh final-source evidence.
- `pnpm run test:integration:list` — new campaign discovered; all matrix tests ran and passed.

Parent verification, 2026-10-22:

- The exact four root gates exited zero: 2,703 unit tests across all eight workspaces; only the
  incumbent Vite large-chunk warning. Coverage exited zero with every existing floor unchanged.
  Web coverage: 96.37% statements, 90.94% branches, 96.97% functions, 97.54% lines.
- After the report-format correction, the exact root gates passed again when run independently
  of coverage and browser work. The supplemental production run
  `privacy-2026-10-22T12-35-08-571Z-cb681bca` approved all six groups with no executor errors;
  all 49 manifest hashes and 22 source hashes match, the source aggregate is unchanged, SQL is
  unchanged and forbidden/outside requests are empty. Owned cleanup and foreign preservation
  completed at `2026-10-22T12:38:50.093Z`. This is supplemental behavioral verification; the
  bounded visual review remains attached to the canonical 12:23 capture set below.
- Independent final-source production campaign:
  [report](../../../apps/web/.impeccable/review/campaigns/privacy-2026-10-22T12-23-03-053Z-33be45dc/results/report.md).
  Six groups approved, no executor errors; both build manifests identify source hash
  `91de212d6b9e2a4740233f16b4ed675d71357cb13931a9e8aac0df68fc5e7726`.
  All 22 source-file hashes and every capture hash match the current files; SQL unchanged,
  no external or forbidden requests. Cleanup removed owned resources and preserved foreign
  resources at `2026-10-22T12:24:41.384Z`.
- Matrix audit: document → component tests and PRIVACY-001; all three licence branches → 32 parser
  cases/component tests and actual four-source synthetic oracle in PRIVACY-001; empty → component
  tests and PRIVACY-003; read failures/cancellation/deadline/stale recovery → client/component tests
  and PRIVACY-003; configuration → config tests and two production builds in PRIVACY-004;
  navigation → 24 public-entry/history combinations in PRIVACY-002; boundaries → PRIVACY-006 and
  teardown. Every mapped test executed and passed. No licensed real source was enabled to create
  an otherwise forbidden browser fixture.
- Two bounded visual rounds completed. The second independently opened all 43 final campaign
  document, configured/recovered, entry-footer and incumbent-reference images. Captures valid;
  no material defect found. The one post-round detector invocation (`impeccable detect --json`
  from `apps/web`) exited zero with `[]`. Fresh finish review/documentation remain separate
  handoffs. Automated axe/keyboard evidence is not a claim of manual assistive-technology testing.
- Fresh independent finish review returned `ship`, with persistence/fidelity/ceiling passing and
  no material fixes. Its five-section return is preserved in
  [the finish review](../../../apps/web/.impeccable/review/privacy-finish-review-2026-10-22.md).
  It independently opened all 43 required captures; no browser was rerun by that reviewer.
- Fresh documenter completed the ordinary-extension reconciliation in
  [the documentation check](../../../apps/web/.impeccable/review/privacy-documentation-check-2026-10-22.md).
  It sampled source/system and three valid hashed final captures, recorded existing drift without
  repair and preserved both global design hashes exactly. The parent read its complete report and
  independently reconfirmed the two preserved hashes. No production changes followed verification.

## Auto Run Result

- Implemented the complete public bilingual notice and all six public entry points, exact
  enabled-source/licence/permission display, safe optional build-time identity/contact and bounded
  cancellable source reads with honest empty/error/stale/manual recovery states.
- Production files: `packages/contracts/src/collection/{enabled-source.dto,index}.ts` close and
  export the public parser; `apps/web/src/privacy/*` and `styles/privacy.css` supply the policy,
  stateful document and read client; config, locale/resources, routes, shell and landing join the
  document without geographic context; Compose and the web Dockerfile pass public build arguments.
- Tests: parser/config/client/component/shell/locale regressions plus
  `integration/web-privacy.integration.test.ts` cover the matrix. Review/campaign artifacts retain
  complete production evidence and earlier executor-assumption failures rather than hiding them.
- Review: quick lens, zero findings; patched high/medium/low counts 0/0/0; no deferred or rejected
  findings. Follow-up review recommendation: false, with no specific unverified patch risk.
  Independent visual review: `ship`, no material fixes. Ordinary-extension documentation completed;
  global design files preserved and pre-existing drift reported without unsolicited repair.
- Verification: exact root gates, coverage, integration discovery, independent owned production
  browser campaign, matrix/hash/SQL/network/teardown audit, two bounded visual rounds and one
  empty detector result all passed as detailed above. Existing coverage floors/hooks unchanged.
- Residual limits: public controller/contact configuration is intentionally absent by default;
  real processing, supplier ZDR and complete retention/removal obligations remain gated. No source
  enablement, public erase flow, legal certification, full WCAG/manual screen-reader certification,
  external processing, deployment or VPS operation is claimed. No push or AI trailer is authorized.
