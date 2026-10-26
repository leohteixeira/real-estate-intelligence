---
title: 'Market in production'
type: 'chore'
ticket: '9'
created: '2026-10-26'
status: 'built'
baseline_revision: '533acdef9ab17b2e4257e8bb841eedd4ee0d4aa5'
route: 'oneshot'
route_source: 'auto'
risk: 'medium'
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-9 still needs actual public production proof for a neighborhood's figures,
registered neighbours and twelve-month series over the genuinely collected synthetic events.

**Approach:** Read the three published Market endpoints under the authorized prefix, validate
strict DTOs and manually derived catalog values, counts, sources, freshness and computation.
Preserve the receipt with the existing release evidence; correct only a demonstrated defect.

</intent-contract>

## Implementation Notes

- Oneshot estimate: at most 100 probe lines; read-only standalone strict TypeScript with existing
  Supertest helper and public DTO parsers. No runtime change, additional fixture or abstraction.
- Use Bela Vista: one property/three listings/three sources, Aurora minimum 78000000/82 rounded
  to 951220 centavos/m²; actual Centro parent. Six-month baseline is 975610, zero 30-day listing
  reductions, ratio three, observed duration since 2025-10-01T12:00Z, no recorded sale.
- Its sole registered neighbour is Vila Mariana, one represented property, Cobalto minimum
  124000000/135 rounded to 918519 centavos/m² and unchanged paired movement. Verify its sources.
- Twelve monthly own/parent medians: November/December 1000000, January–June 975610,
  July–October 951220. Validate exact month/cutoff order, contributor count/source and actual
  calculation stamps distinct from historical population cutoffs. No prepared fallback.
- Preserve D-096/D-097/D-098 rules and 3.13's real-clock absence limit. Current rules reconstruct
  event transitions, not every no-op acquisition. Snapshot read timestamps remain authoritative.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Quick review

- Verdicts: 0 findings. Independent inspection confirmed the catalog oracle, recorded public
  values, cutoffs, contributor evidence and parser invariants. No patches, deferrals or rejections.

## Verification

- Execute the manual read-only probe once after its assertions stabilize; preserve all three
  dated parsed HTTPS responses, delivered source identity and observed passing assertions.
- Run strict integration typecheck, focused ESLint/Prettier and scoped Markdown checks, normal
  hooks and whitespace checks. Reuse unchanged runtime gates from 2.12 and original Market
  figures/price-facts/median/browser campaigns; no runtime build/test repetition is necessary.
- Required independent Quick inspection covers this evidence and its exact catalog oracle only.

Observed public proof: the three trusted HTTPS reads passed every planned numerical, population,
source, calendar and freshness check. Delivered runtime source remains
`b570a09427bea39ea03d4dda93c7dc0e0c502899`; no deployment or runtime change was needed.
The completed receipt and source are preserved in the ignored protected workspace directory
`/workspace/.ignore/rei-production-evidence/20261026T195350Z/` as `market-public.json` and
`market-public-probe.ts`. Initial response-only reconnaissance remains separate in
`/tmp/rei-market-public-initial.json`.

The host copy failed because the forwarded SSH agent stopped returning identities. A directed
verbose connection confirms agent communication failure before authentication; no host service or
public read failed. Do not repeat deployment or HTTP evidence for that transport limitation.
Preserve the workspace receipt and copy it to the existing protected host collection directory
when that mechanism is available. This does not invalidate the observed public acceptance.

The first strict compile caught the TypeScript standard-library `Object.entries` loss of type
information at the figure loop. Replace it with the six explicit typed public keys; no runtime
assertion, value, request or timeout changes. Formatting expanded the localized probe to 160 lines;
there is no new product implementation or harness. Reuse the successful public read; the final
strict compile is recorded separately from the rejected compile.

Final strict integration compile passed (`/tmp/rei-market-public-typecheck-final.log`, exit 0);
focused ESLint, Prettier, scoped Markdown lint and whitespace checks passed. The original rejected
compile is preserved at `/tmp/rei-market-public-typecheck.log`. No runtime code changed.

## Auto Run Result

- Built a read-only public Market probe and observed its passing three-response campaign at
  2026-10-26T20:19:40.291Z–20:19:40.586Z against delivered source recorded above.
- Files: `integration/fixtures/probe-market-production.ts` checks the public contract and exact
  catalog oracle; this plan and `docs/operations/deployment.md` preserve acceptance and limits.
- Review: independent Quick completed without findings; patched high/medium/low 0/0/0,
  deferred/rejected 0. No follow-up or unverified changed-path risk remains.
- Final strict integration compile, focused lint/format, Markdown and whitespace passed; ordinary
  commit hooks remain active. Runtime checks are reused because no product/dependency changed.
- Residual operational limitation: workspace receipt is protected and verified; its additional
  host copy awaits restoration of the forwarded SSH agent. Public acceptance is observed and
  unaffected. No production write, model call, deployment or remote CI is claimed by this story.
