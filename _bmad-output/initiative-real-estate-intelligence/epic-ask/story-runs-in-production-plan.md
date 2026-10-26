---
title: 'Runs in production'
type: 'chore'
ticket: '15'
created: '2026-10-26'
status: done
baseline_revision: '0c248fe9f1dbac20b6a881aa69558e2579be4a44'
route: 'oneshot'
route_source: 'auto'
risk: 'high'
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

**Problem:** CAP-10 and CAP-15 need observed evidence that a question on the public address
completes with the deterministic rule value, while only the AI service receives the gateway key
and that service receives no database, broker or storage credential.

**Approach:** Submit one synthetic routed price question through the published prefix, consume
its real SSE terminal event and inspect its persisted snapshot. Inspect only container environment
names, mounts, networks and delivered image identity. Preserve sanitized receipts with the existing
release evidence. Correct only demonstrated acceptance defects.

</intent-contract>

## Implementation Notes

- Oneshot estimate: at most 100 logical probe lines using the existing Supertest helper, public
  DTO parsers and product SSE decoder. No product abstraction or runtime change is planned.
- Expected arithmetic: BRL 785000.00 / 68 m² = 1154412 centavos/m². Fresh strong bearer authority
  and idempotency key stay in memory; no credentials, cookie values or request headers in receipts.
- Use routed-text-v1: record actual decision source and degraded status. The accepted heuristic
  fallback can satisfy the value proof; it does not prove successful Jev classification or model
  explanation. Preserve the earlier live probe's privacy rejection without retrying it blindly.
- Production isolation was observed at 2026-10-26T20:27:22.835644Z: healthy delivered AI image,
  no mounts, only application/telemetry networks, no forbidden dependency credential names.
- Reuse unchanged deployed source b570a09427bea39ea03d4dda93c7dc0e0c502899 and the existing
  local Ask/trace/headless gates. Do not redeploy, rerun migrations or restart unrelated services.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Quick review

- Verdicts: 0 findings. Required independent inspection found no unmet acceptance, broken rule
  or changed-path bug. Patched/deferred/rejected 0; no follow-up is needed.

## Verification

- Strict integration TypeScript compile and focused ESLint/Prettier before the public write.
- One public synthetic question, explicit terminal SSE, matching owner snapshot and exact rule
  value. No automatic retries, weakened assertions, timeout increases or quota bypass.
- Protected host container-name inspection confirms gateway key only in AI, no dependency
  credentials or mounts in AI, actual images and health. Preserve dated sanitized evidence.
- Scoped Markdown, whitespace, normal hooks and required independent Quick inspection. Reuse
  previously passed unchanged runtime tests and coverage; this story adds only a manual probe.

Directed first-attempt diagnosis: the plain Node source import failed before HTTP because the
frontend uses build-time `.js` specifiers. A temporary Node resolution hook maps only missing
relative `.js` imports to `.ts`; product files and dependencies remain unchanged. The strict
integration compile and focused lint passed before the public request.

The first public request was accepted at 20:31:58.162Z and completed at 20:32:30.127Z with
1154412 centavos/m², heuristic-v1/degraded and one retained Market receipt. The probe's unchanged
30-second HTTP deadline expired before terminal; preserve that failed attempt, never claim it
passed. Tempo trace 3a233a4b5cbb548eddb6fe617469cebf shows the initial 4.656-second execution
interrupted during checkpoint writes, then native claim recovery completed in 0.420 seconds.
The decision was retained; the tool receipt was reused. Production AI has 3255 throttled periods
of 4987, API 3287 of 9280 under 0.25 CPU. Adjust only API/AI to 0.5 CPU, without memory or timeout
changes, then run one fresh synthetic question to test the measured throttling hypothesis.
This is an operational dependency of the public acceptance, not a new audit or model retry loop.

With only API/AI raised live to 0.5 CPU, the explicitly separate hypothesis-check run
01a179ec-3534-7cd7-9ec7-aeac58305fea passed at 20:34:45.579Z–20:34:48.184Z. Four ordered SSE
frames include exactly one completed terminal; the owner snapshot matches it and exact rule
inputs/value/currency/unit. Decision is heuristic-v1, degraded, probability 0.9. No model-generated
explanation or Jev success is claimed. The original attempt remains failed at the client and
completed at the product; neither timeout nor retry settings changed.

Receipts and exact source/resolver are protected in the existing host collection directory:
ask-public-first-admission.json, ask-public-first-persisted.json, ask-public-first-tempo.json,
ask-public-cpu-adjusted.json, ask-public-probe.ts, ask-ts-source-loader.mjs,
ask-production-isolation-complete.json and ask-cpu-before.json. Gateway key appears only in AI;
its networks, mounts, credential-name absence and all four healthy delivered image identities
were verified without reading secret values. The separately preserved Market proof was copied
to the same host directory after restoration of the forwarded SSH agent, with hashes unchanged.

Final strict integration compile, focused ESLint/Prettier and the existing production Compose
contract tests passed; no product images, application code or timeout policy changed.

Host Compose and actual API/AI limits both read back as 0.5 CPU, with unchanged image identities,
memory and healthy status; protected receipt ask-cpu-applied.json. All 25 existing production
configuration tests passed (11.69 seconds, /tmp/rei-ask-production-config.log). The attempted
Markdown CLI call included its configured broad globs and rejected ignored rendered workflow
files; use the existing hook's --no-globs option for the changed documents, without editing those
unrelated artifacts or weakening lint rules.

## Auto Run Result

- Delivered public run/SSE/snapshot acceptance and sanitized runtime isolation evidence, plus
  the measured API/AI CPU correction. Runtime images/source remain those already published.
- Files: compose.production.yaml raises only API/AI CPU; probe-ask-production.ts verifies the
  live public route/terminal/rule; this plan and deployment.md preserve actual evidence/limits.
- Review: required independent Quick reported no findings. Patched high/medium/low 0/0/0;
  deferred/rejected 0; followup_review_recommended false. No broad review reopened.
- Strict integration compile, focused ESLint/Prettier, 25 production configuration tests and
  changed-document Markdown/whitespace checks apply. Reuse unchanged lint/typecheck/unit/build,
  coverage and actual native Ask integration/trace/headless gates already recorded in predecessors.
- Original failed client attempt remains failed; accepted run is a distinct hypothesis check
  after the measured CPU condition changed. No timeout, assertion, quota or retry relaxation.
- Residual evidence boundary: success demonstrates the admitted degraded decision and exact tool
  result; successful live Jev classification and model explanation are not claimed by this proof.

The accepted run is also observed in Tempo trace d674a661df55c195c74801baa86380e8:
one ask.run execution lasting 1258.161387 ms, with HTTP, publish, consume, decision, graph nodes,
checkpoints and tool spans. Exact trace: ask-public-cpu-adjusted-tempo.json. No generative span
is expected or claimed for routed-text-v1. Changed-document Markdown and whitespace passed.
