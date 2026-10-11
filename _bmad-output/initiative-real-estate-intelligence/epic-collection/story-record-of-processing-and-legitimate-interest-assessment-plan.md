---
title: 'Record of processing and legitimate-interest assessment'
type: 'chore'
ticket: '11'
created: '2026-10-10'
status: done
baseline_revision: 'c3de8579fbb4c76d391ae493fc8769ea6ab7d39e'
route: 'full'
route_source: 'auto'
risk: 'high'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /workspace/repos/real-estate-intelligence/specs/adrs/0015-handling-of-collected-data.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0018-snapshot-encryption-and-acquisition-retention.md
  - /workspace/repos/real-estate-intelligence/specs/adrs/0019-expired-snapshot-reconciliation.md
warnings: [oversized]
deferred: []
---

## Orchestrator Closure — 2026-10-11

Ticket 2.11 was resolved individually with `tickets.py find`; its committed implementation,
verification record and final review disposition were audited before acceptance. The final
plan recommends no follow-up review. Existing residual limits and deferred owning-story scope
remain intact; this acceptance does not close the parent epic or the initiative.

The parent inspected both version-1 privacy documents and the epic's D-019 acceptance:
`docs/privacy/record-of-processing-operations.md` and
`docs/privacy/legitimate-interest-assessment.md` remain accepted on the owner's behalf on
2026-10-10. This accepts the engineering documents only, not real processing or legal approval.

Fresh verification on product revision `5fae2e2ddda193525f75d4a48f7e758edd6999d3`:
`pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` passed,
including strict integration typing and 144 unit files/1,503 tests. All eight unchanged coverage
floors passed. `pnpm run test:integration` passed 24 files/43 tests in 827.31 s without skips
or retries. Exact before/after inventories preserved all 13 containers and 13 volumes;
no owned fixtures or Ryuk remain. These commands ran after the final RunExecutor review patches;
subsequent changes are documentation/status only. No global generated-Markdown success is claimed.

Historical implementation/test/result commits, resolved to canonical identifiers:
`25120e5129e3b20f53980a74de71c8389ec2ae98`.
The user stash is preserved. No source activation, VPS action, push or deployment occurred;
VPS-dependent stories still await the owner's explicit unblock.

<intent-contract>

## Intent

**Problem:** CAP-28 requires a record of processing operations and a legitimate-interest
assessment before the first real collection. Neither document exists; the controller's delegated
acceptance must be auditable without pretending source permission or production evidence exists.

**Approach:** Write and cross-link a versioned reference inventory and a reasoned assessment,
accepted by the agent on the owner's behalf under D-019. Describe the synthetic-only current
state and the disabled real-data design, including conditional activation requirements.

## Boundaries & Constraints

**Always:** English repository content; authoritative ADR and epic decisions before spec and
code; a natural-person owner/controller; accurate status and acceptance date; closed real-listing
allowlist; default-denied source permissions; explicit transient data processing and indirect
identification risks; 30-day acquisition expiry and fair reconciliation; distinguish contractual
policy from implemented evidence; preserve D-001 through D-018 in the append-only external log.

**Never:** Fabricate legal identity, contact e-mail, provider contract, hosting country, source
permission, legal approval, production evidence or statutory exemption; equate masking or hashing
with anonymization; change runtime code, ADRs, ticket entries, sources, retention settings or
application configuration; collect real content, deploy, access the VPS, push or read `.env*`.

## I/O & Edge-Case Matrix

| Scenario                    | Input / State                                     | Expected Output / Behavior                                                                  | Error Handling                                 |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Accepted records            | Owner-delegated hitl acceptance                   | Both version-1 records accepted with D-019 and dated marker                                 | No claim of personal/legal signature           |
| Current inventory           | Synthetic fixtures and local campaigns            | State current local operations, no real collection                                          | No fabricated production status                |
| Real-source proposal        | Missing permission or pre-collection prerequisite | Real processing remains disabled; evidence list names responsible owner and related stories | No blanket approval                            |
| Incidental personal content | Free text, URLs, location linkage or photographs  | Document minimization, transient processing, limits and fail-closed escalation              | No anonymity guarantee                         |
| Retention and deletion      | Expired generations, suppression and backups      | Fixed snapshot window; hash retained; suppression-first erasure is planned until delivered  | No promise all data expires in 30 days         |
| External services           | Future hosting, telemetry, AI, public readers     | Record recipients and unresolved region/contract evidence without inventing them            | New processing requires inventory reassessment |

</intent-contract>

## Code Map

- `docs/privacy/record-of-processing-operations.md` — create reference inventory; controller,
  categories/subjects, purpose/legal basis per operation, systems, recipients/transfers, retention,
  access/security, rights/removal, implementation status and release gates.
- `docs/privacy/legitimate-interest-assessment.md` — create explanation/assessment; concrete
  purpose, necessity and alternatives, reasonable expectations, adverse impacts, safeguards,
  residual risks and conditional conclusion; cross-link inventory operations.
- `README.md` — add focused privacy-record links near specification links only; do not rewrite
  unrelated stale foundation prose or commands.
- `_bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md` — append
  D-019 Decision and acceptance Notes without rewriting existing decisions.
- `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`
  — CAP-28 and Constraints, Privacy and sources (around lines 105 and 338).
- Spec `architecture.md` — Privacy and sources (around lines 255–325), topology/context inventory;
  architecture current-state paragraph is historically stale, not proof of runtime absence.
- Spec `listing-sources.md` — existing frozen review outcomes; synthetic-only MVP, no portal
  allowed, Caixa and ITBI disabled pending written permission, GeoSampa V2 reference only.
- `specs/adrs/0014-zero-data-retention-for-user-text-routes.md` — every user-text external model
  route requires evidence before transmission; ZDR is not the collection legal basis.
- ADRs 0015, 0018, 0019 — no contacts/person names/individual CRECI/photos/unit/complement stored;
  known-name sanitizer is not general prose name recognition; AES-256-GCM has no fallback key;
  access and commit close at fixed expiry, deletion may lag while reconciliation continues.
- `specs/adrs/0017-dead-lettering-and-delivery-retention.md` — outbox seven days, inbox thirty;
  not the retention rule for audit, normalized history, operational logs or backups.
- `migrations/4002_collection_expand_source_register.sql`, domain `source-registration.ts` —
  persisted source evidence and separate image/text permissions; no real source enabled.
- `packages/infrastructure/src/collection/canonical-snapshot-sanitizer.ts` and domain
  `snapshot-privacy.ts` — closed canonical JSON projection, unsafe provenance rejected, query/fragment
  removed; arbitrary source payload must be translated in memory before persistence.
- `migrations/4006_collection_add_snapshot_lifecycle.sql` and `4007_collection_add_snapshot_reparse.sql`
  — immutable acquisition/hash history, expiry guards and durable original fingerprints.
- Existing plans 2.7 and 2.8 — verification evidence for lifecycle and correction only, not proof
  suppression/images/normalization/public notice already exist.
- `/workspace/docs/real-state-intelligence/decisions.md` — D-019 already appended by coordinator;
  do not modify it in implementation.

## Tasks & Acceptance

**Execution:**

- [x] `docs/privacy/record-of-processing-operations.md` — write complete scoped inventory with
      stable operation IDs for acquisition/sanitization, snapshot/reparse, derived listing/history,
      conditional image fingerprinting, suppression/rights and operational event/telemetry data.
      Distinguish current implementation from future obligations and incidental personal data.
- [x] `docs/privacy/legitimate-interest-assessment.md` — reason through purpose, necessity,
      alternatives (synthetic, publisher/licensed feeds, no image/text), expectations and risk;
      map safeguards and stop conditions to inventory and ADRs. Accept documentation, not real
      processing. Explicitly cover weak name recognition, linkage, URLs/hashes, biased matches,
      photos, deletion/reprocessing and restored backups.
- [x] `README.md` and collection epic — discoverability, identical version/date/delegated
      acceptance marker and D-019 Decision. No unrelated edits.
- [x] Plan Implementation Notes and Verification — record exact artifacts, review/evidence matrix,
      source checks, full repository gates and absence of new runtime/API/UI/configuration.

**Acceptance Criteria:**

- Given `tickets.py find 2.11` and delegated autonomy, when both records are opened from README,
  then their scope, version, accepted status, date and agent-on-owner's-behalf attribution are
  explicit and agree with D-019 and epic Notes.
- Given CAP-28 and the authoritative ADRs, when each inventory operation and assessment is audited,
  then purpose, subjects/data, lawful-basis reasoning, recipients, retention, rights, security and
  residual risks are covered without weakening the allowlist, permissions or fixed expiry.
- Given missing source authorization, public controller/contact details, unresolved processors or
  unimplemented pre-collection controls, when a reader seeks real-source activation, then both
  documents require verified source-specific evidence and keep real processing disabled.
- Given the worktree diff, when lint, typecheck, test and build run, then all pass with no weakened
  gate and only the four scoped documentation artifacts plus this plan changed.

## Implementation Notes

Implemented on 2026-10-10:

- Created the reference inventory with stable ROP-01 through ROP-06 sections: acquisition and
  sanitization, snapshot/reparse/reconciliation, derived listings/history/metrics, conditional
  images, rights/suppression, and events/audit/logs/telemetry. Each records purpose, subjects/data,
  conditional basis, systems/recipients/access, retention/rights and implementation status.
- Created the explanation assessment: concrete property-market purpose, necessity and synthetic/
  licensed-feed/no-text/no-image alternatives, reasonable expectations, linkage and biased-match
  risks, safeguards mapped to each operation, conditional conclusion and explicit stop conditions.
- Both documents use identical version-1/status/date/agent-on-owner's-behalf D-019 markers.
  README links them beside the specifications; epic Notes records the decision and acceptance.
  Existing README prose, commands, decisions and external D-001 through D-019 remain unchanged.
- Distinguished current local synthetic/lifecycle/correction evidence from pending images,
  suppression, notice, normalization/public exposure, supplier contracts/regions, operational
  retention and restored-backup controls. Known-name masking is not general name recognition;
  no URL/hash/fingerprint is declared anonymous. Fixed acquisition expiry remains 720 hours,
  while physical deletion may lag and fair durable tombstone reconciliation continues.
- Read all frontmatter context ADRs before implementation, then checked CAP-28/privacy constraints,
  architecture topology/context inventory, source review, ADRs 0014/0017, source-register rules,
  canonical sanitizer/projection, migrations 4002/4006/4007 and collection 2.7/2.8 evidence.
  Rechecked the official LGPD and ANPD guide via browsing; the ANPD record-model announcement
  initially failed direct opening but its official-domain search result confirmed the coverage.
  Legal-source discussion is short paraphrase without direct quotation, under each 180-word limit.
- No runtime, API, UI, dependency, migration, ADR, ticket, source, setting or application
  configuration changed. No real source, VPS, production deployment or ignored file was accessed.
  VPS-dependent delivery remains pending for the owner's return.

Full route: more than 100 new non-mechanical documentation lines are expected across two
substantive privacy artifacts plus two indexes. Risk raised from low to high because a misleading
legal/privacy acceptance could incorrectly authorize processing. D-019 resolves acceptance scope
before implementation. Documentation-writer classifies the record as reference and the assessment
as explanation; owner autonomy overrides its interactive outline-confirmation step. BMAD controls
the plan location and implementation handoff instead of writing-plans' interactive defaults.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. The context-free Quick reviewer reported no unmet acceptance criteria,
  broken rules or bugs; no patch, deferral or rejection was required.

## Design Notes

This is a record of the product's engineering interpretation, not legal advice, a RIPD, an ANPD
approval, a compliance certificate or a claim that every release gate is implemented. The spec's
small-size-controller model is an operating assumption requiring evidence before relying on a
regulatory relaxation. Personal controller/contact configuration must be supplied through the
future notice mechanism, never invented or read from ignored files.

Legal references verified by coordinator on 2026-10-10:

- [LGPD, consolidated official text](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm),
  especially articles 5–7, 10, 12, 18, 37–38 and 46. Limit legal paraphrase from this source to
  180 words across the two documents, use no direct quotes.
- [ANPD legitimate-interest guide, February 2024](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf/@@display-file/file),
  phases purpose, necessity, balancing/safeguards; legitimate interest is not the sensitive-data
  basis. Limit source-derived summary to 180 words across both documents; no direct quotes.
- [ANPD processing-record model announcement](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-modelo-de-registro-simplificado-de-operacoes-com-dados-pessoais-para-agentes-de-tratamento-de-pequeno-porte-atpp)
  names institution contact, data subjects/categories, sharing, security, retention, operation,
  purpose/basis and observations. It is a coverage aid, not a claim of exemption/eligibility.

## Verification

### Independent coordinator verification — 2026-10-10

- Staged and read the complete 782-line unified diff from the canonical baseline, including
  both new records and the plan. The five-file scope matches the authorized documentation change.
- Independently reran `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build`:
  exit 0, 832 tests passed, no skips, unchanged existing web chunk-size warning.
- Independently reran five-file Prettier, unchanged Markdown rules with `--no-globs`, staged and
  unstaged whitespace checks: exit 0, zero Markdown errors. Redacted unified-diff secret scan
  checked approximately 64.58 KB and reported no leaks.
- Executed six read-only Node document acceptance tests, one for every intent-matrix row:
  matching delegated acceptance/README discovery; complete six-operation inventory and synthetic
  boundary; responsible owner and separate real-source gates; transient processing and unsafe
  content/non-anonymity limits; fixed expiry versus hash/suppression/backup obligations; and
  unresolved recipients/transfers with reassessment and independent ZDR. All six passed.
- The same executed check resolved all 27 relative links and anchors. Full semantic reading
  corroborated each row against the authoritative ADRs and implementation evidence, rather than
  treating keyword assertions as proof of operational controls. External D-019 and epic
  acceptance agree. No real-source permission, controller identity or production fact is invented.

### Implementation verification — 2026-10-10

| Matrix row / acceptance requirement   | Observable evidence                                                                                                                                                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Accepted records and README discovery | Both full documents have identical version 1, accepted engineering-baseline status, 2026-10-10 date and delegated D-019 marker; README and epic links resolve and agree with external D-019.                                                                             |
| Current inventory                     | Inventory State/data boundary and each operation's status distinguish local synthetic campaigns from proposed real-data processing; no fabricated deployment or production claim.                                                                                        |
| Real-source proposal                  | Inventory Activation evidence names the owner and related stories; assessment Conditional conclusion keeps real processing disabled until source-specific permission, notice/rights, recipient and retention gates close.                                                |
| Incidental personal content           | Inventory ROP-01/03/04 and assessment Balancing cover memory receipt, unsupported formats, missed prose names, location/URL/hash/fingerprint linkage, sensitive incidental content, photographs and biased matches.                                                      |
| Retention and deletion                | ROP-02/05/06, restoration obligations and assessment necessity/balancing preserve 720-hour expiry, independent acquisition, access/commit refusal, ongoing fair cleanup, suppression-first erasure, correction propagation and backup gates. No all-data 30-day promise. |
| External services                     | Inventory Systems/sharing/transfers and assessment Safeguards require verified roles/contracts/regions/transfer evidence; future hosting/telemetry/model/public recipients are distinguished from local systems. ZDR is separate from collection basis.                  |
| CAP-28 and ADR coverage               | Six stable operations each expose purpose, categories, basis/necessity, recipients/access, retention/rights, security/status; safeguards matrix links authority to actual evidence or pending delivery.                                                                  |
| Scoped diff and repository gates      | Four scoped documentation artifacts plus this plan only; unchanged lint/typecheck/test/build gates all passed, as did five-file format/Markdown, link/marker and secret/whitespace checks.                                                                               |

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` exited 0. All
  **832** tests across eight workspaces passed without skips: domain 249, application 96,
  infrastructure 241, worker 189, API 25, contracts 9, AI 9 and web 14. The existing Vite
  `CityScene` chunk-size warning remains; no test, rule or gate was weakened.
- Scoped Prettier check passed for all five files. Scoped Markdown lint with `--no-globs` passed
  with zero errors in exactly five files, preserving the repository's rules. The first command
  without that flag inherited root `**/*.md` and found the existing **1467** unrelated generated/
  rendered BMad violations across 172 files. That historical failure was not repaired or hidden;
  `--no-globs` selects the intended scope without changing any rule or configuration.
- Read both complete formatted documents and manually audited the matrix above against source
  facts, including closed fields, separate permissions, sanitizer limits, no fallback key,
  fixed expiry, fair reconciliation and pending suppression/image/public-notice work.
- A read-only Node check resolved all **27** relative links and anchors across the two records,
  README and epic, validated identical document acceptance markers and all six operation IDs.
  Manual comparison confirmed README/epic acceptance agrees with D-019, without invented
  identity, contact, provider, contract, hosting country or legal approval.
- `git diff --check` passed. A redacted `gitleaks stdin --redact --no-banner` scan of the exact
  five scoped documents found no leaks. Final status showed only README, epic Notes, the two
  privacy files and this existing untracked plan as changed/new files.
- No new unit, integration or browser test was necessary: there is no runtime journey or
  semantic change. Existing code gates establish compatibility; the actual changed surface
  was verified through complete document reading, links, source facts and matrix/AC audit.

**Commands:**

- `pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build` — all exit zero.
- Scoped Prettier and Markdown checks below — all formatted, zero errors.
- `git diff --check` — no whitespace errors; scoped diff and redacted secret check before commit.

```bash
pnpm exec prettier --check \
  docs/privacy/record-of-processing-operations.md \
  docs/privacy/legitimate-interest-assessment.md README.md \
  _bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md \
  _bmad-output/initiative-real-estate-intelligence/epic-collection/story-record-of-processing-and-legitimate-interest-assessment-plan.md
pnpm exec markdownlint-cli2 --no-globs \
  docs/privacy/record-of-processing-operations.md \
  docs/privacy/legitimate-interest-assessment.md README.md \
  _bmad-output/initiative-real-estate-intelligence/epic-collection/epic-collection.md \
  _bmad-output/initiative-real-estate-intelligence/epic-collection/story-record-of-processing-and-legitimate-interest-assessment-plan.md
```

**Manual checks:**

- Read both complete documents; map every matrix row and AC to observable sections, not just a
  keyword check. Cross-check retained fields/windows/current-state assertions against sources.
- Resolve every relative link from each document to an existing in-repository file. Inspect
  acceptance/version/date markers and D-019 consistency, and confirm no placeholders or fabricated
  identity/contact/provider/legal facts.
- No code, runtime journey, endpoint, UI or data semantics change: no new unit/integration/browser
  test is necessary for this documentation-only story; run the existing unit/gate suite and
  validate the actual document surface. Final broad E2E campaign remains goal-wide work.

## Auto Run Result

- Status: `built`; first-pass documentation delivery, not completion of the initiative.
- Implemented CAP-28 version-1 processing inventory and conditional legitimate-interest
  assessment, accepted on the owner's behalf under D-019 without authorizing real collection.
- Files changed:
  - [Processing inventory](../../../docs/privacy/record-of-processing-operations.md): six stable
    operations with purposes, data, conditional basis, recipients, retention and evidence gates.
  - [Assessment](../../../docs/privacy/legitimate-interest-assessment.md): necessity/alternatives,
    expectations, adverse effects, safeguards, conditional conclusion and stop conditions.
  - [README](../../../README.md): focused discovery links and delegated acceptance marker.
  - [Epic](epic-collection.md): matching D-019 Decision and acceptance, preserving prior Notes.
  - This plan: implementation, executed matrix audit, independent verification and review result.
- Review: Quick pinned; 0 findings, 0 patches, 0 deferred and 0 rejected. Patched counts:
  high 0, medium 0, low 0. `followup_review_recommended: false`; no unverified patch risk exists.
- Verification: independent lint/typecheck/test/build exited 0; 832 tests passed without skips.
  Scoped formatting and Markdown, six executed matrix checks, 27 relative links/anchors,
  whitespace and redacted secret checks passed. No runtime journey changed.
- Residual limits: real sources stay disabled. Public controller/contact, pending rights/notice/
  image/display controls, recipient/transfer evidence, non-snapshot retention, backup safeguards
  and production verification remain separately documented activation obligations. VPS work
  awaits the owner's return. The existing web chunk-size warning is unchanged.
