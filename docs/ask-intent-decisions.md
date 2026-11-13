# Routed Ask decisions

`routed-text-v1` is available through public versioned HTTP commands and
`AskRunService.createRouted()`. It admits text before deterministic operands are available,
preserves the three historical tracer modes and uses the separate `intent-routing-v1` graph.
The Ask screen remains a later slice.

Clients retain their own strong Bearer capability (43–128 ASCII letters, digits, underscores or
hyphens). Creation never issues a capability or recovers one from a creation key. All command
bodies are closed JSON objects and reject extra fields; query parameters are rejected.

- `POST /api/v1/runs`, with `Authorization: Bearer <capability>` and a 16–128 character
  `Idempotency-Key`, accepts
  `{ mode: 'routed-text-v1', threadId: null, placeId: null, query: <text>, locale: 'en' }`.
  `threadId` can instead name an owned thread; `placeId` accepts a slug and locale also accepts
  `pt-BR`. A 202 response contains exactly
  `{ mode: 'routed-text-v1', runId, threadId, state: 'queued' }`.
  Repeating the same body, key and capability returns the same identity. A changed body conflicts;
  foreign authority is forbidden. `GET /api/v1/runs/:id` returns the current typed retained run.
- `POST /api/v1/runs/:id/confirm` accepts `{ runId, decisionReceiptId, inputs }` under the same
  Bearer capability. The body run ID must match the path, and the receipt must be the retained
  proposal. Inputs are validated editable price operands or explicit null. The 200 response is
  the same retained run, queued for resumption without another routing decision. Identical
  confirmation replay is idempotent; changed operands conflict.
- `POST /api/v1/runs/:id/cancel` accepts exactly `{ reason: 'visitor_cancelled' }` under that
  capability, without a decision receipt. It returns the typed run with HTTP 200. Queued, running,
  confirmed-queued and awaiting runs can be cancelled. Existing terminals are returned unchanged.
  Historical tracer modes reject these routed confirmation/cancellation commands.

These commands retain the existing sanitized 400/401/403/409/429/503 errors. A pending-thread
capacity rejection is distinct from visitor quotas; no quota policy is added here.

The closed `ask-intents-v1` taxonomy contains price per square meter, listing search, property
history, region statistics, comparables and unsupported. Only price per square meter currently
has an executor. After the same gate, each other accepted label finishes with `completed`, a null
terminal reason and the closed result
`{ kind: 'unavailable_intent', intent: <retained label>, reason: 'not_available' }`. The API derives
this result from the retained decision and matching unavailable execution evidence, without a price
tool or model explanation receipt. Missing price operands still finish with `failed` /
`execution_unavailable` and a null result. Market owns operand extraction, validation and arithmetic.

The API retains an immutable decision receipt before the graph saves that decision. A chosen
label probability of at least 0.85 permits execution; lower probabilities persist an interrupt
and `awaiting_confirmation`, with zero price or explanation receipts. The dispatcher completes
the pause after saving its checkpoint and defers the original broker delivery. Confirmation
resumes that pending graph under a fresh lease. Every retry reads the accepted receipt first.

`confirm()` requires the run's visitor capability and retained decision identifier. Editable
operands pass Market validation and are stored separately from the original operands. The label
is unchanged. Confirming a non-price proposal returns that same intent's unavailable result without
another decision call or tool/model effects. Before confirmation its result remains null.
`refuse()` finishes with `cancelled` / `visitor_cancelled`. The first PostgreSQL
pause fixes a ten-minute deadline; confirmation, refusal and maintenance share the thread lock.
At or after that deadline the terminal state is `expired` / `confirmation_expired`. Read,
replay, restart and recovery never extend it. API maintenance expires awaiting runs while the
worker is stopped. Awaiting runs count toward the three-total-pending limit and hold their
thread's admission frontier; other threads remain executable. Unclassified queued requests
retain their two-minute expiry.

General cancellation (D-101) authorizes both before and after the same thread lock, rereads the
retained run and gives SQL-clock expiry precedence when a queue or confirmation deadline is due.
The first committed terminal wins, including completion/cancellation races. One transaction retains
the terminal snapshot, ordered SSE event, terminal outbox event and original delivery inbox marker.
Cancellation preserves prior decisions, confirmations, tool receipts and graph checkpoints and
releases the pending thread frontier. Existing running-lease checks fence later decision, tool,
model and checkpoint writes; late completion cannot replace cancellation. This is a durable
cancellation boundary; it does not add remote interruption of an in-flight model request.

`GET /api/v1/runs/:id/events` uses the same Bearer capability and durable ordered SSE. Each complete
frame carries its versioned ID `<runId>:v1:<sequence>`. On disconnect, reconnect with the last
**complete observed** frame ID as `Last-Event-ID`. The server emits every later stored event once,
including the explicit retained terminal. The same protocol works after an API restart. Replaying
from an already consumed terminal returns an empty completed stream. Malformed, foreign and future
cursors are rejected; transport failure closes transport without inventing a product terminal.

A Claude Haiku classifier (`claude-haiku-5-5`) decides the intent through one direct Anthropic
Messages API request made with the pinned official `@anthropic-ai/sdk`
([ADR 0029](../specs/adrs/0029-direct-anthropic-provider-for-ask.md)). The versioned prompt
`ask-intent-classifier-prompt-v1` lives in `apps/ai/src/models/intent-classifier.prompt.ts`
beside its fixed closed criteria and its closed structured-output schema: exactly `intent`
(one of the six labels) and `probability` (a number), with no additional properties. The visitor's
question is the only variable part of the request and is sent as delimited text to label; thread
history, run identity and grants are never sent. No provider types cross the application port.

The question text is transmitted to Anthropic under Anthropic's standard commercial API terms.
There is no pre-transmission probe, no zero-data-retention verification and no privacy evidence:
a decision written by the classifier has `source: 'claude-haiku-v1'`, `degraded: false` and
`privacyEvidenceId: null`. Receipts written before ADR 0029 keep `source: 'gateway-jev-v1'` with
their original evidence ID and stay valid and readable; no new receipt can use that source with
a null evidence ID or the new source with one.

`probability` is the classifier's own stated confidence that the product should act on the chosen
label without asking first. It is not derived from token likelihoods and is not calibrated. The
prompt instructs the classifier to report 0.85 or above only when the question clearly asks for
exactly one supported capability, and below 0.85 for multi-capability or unsupported questions.
The retained distribution gives the chosen label that probability and spreads the remainder evenly
over the other five labels, so the selected-label probability always comes from the distribution
and the existing closed validation applies unchanged. An unknown label, a probability outside
0 to 1, extra fields, an unexpected model, truncated output or non-JSON output is rejected and is
never repaired.

SDK retries and SDK logging are disabled. Production composes named local-degradation fallback,
bulkhead, logical breaker, transient retry, physical limiter and attempt timeout policies. The
classification allows at most three attempts with full jitter (100 ms exponential base, one-second
cap), subject to a shared ten-second rolling retry allowance of about 10% with two low-traffic
slots. Valid `Retry-After` must fit the remaining deadline plus a complete 3.5-second attempt;
advice over 30 seconds suppresses retry. The original deadline includes queueing and backoff.
Caller abort or original-deadline expiry stops all attempts and cannot produce a heuristic answer.
One failed decision records one transient breaker outcome after retry; successful decisions taking
at least 2.5 seconds contribute one slow outcome while returning the actual decision. Definitive
refusals and local admission pressure are excluded. Exhausted billing (HTTP 402 or an Anthropic
`billing_error`) opens the classifier circuit immediately.
Policy events project named categorical fields only, excluding provider messages and raw headers.
A missing key, authentication failure, provider safety refusal, exhausted billing, open circuit or
exhausted transient retry falls back to deterministic PT/EN `heuristic-v1`, with explicit degraded
provenance and the same confidence gate. Nonconforming classifier output and caller cancellation
are not degraded: they fail the decision.

The offline evaluation uses the 14 public PT/EN rows and safe case IDs in
`apps/ai/src/models/fixtures/ask-intents-v1.ts`. The measured fake classifier comparison and the
existing heuristic run without credentials or network as part of `pnpm test`. They verify
accuracy, selected-label probability, the 0.85 confidence gate, elapsed latency and token-usage
arithmetic. Incorrect and failed decisions stay in the case denominator; mean probability covers
successful decisions only. Confidence expectation accuracy compares the gate with each fixture's
label; it does not claim probability calibration or live model quality.

The optional probe uses exactly the first two fixed synthetic price cases, sequentially through
`AnthropicIntentDecider`, with its original deadlines and zero SDK retries. No heuristic fallback
conceals a provider failure. The default command succeeds without a build, key or provider
initialization:

```sh
pnpm --filter @rei/ai probe:intent
pnpm run build
pnpm --filter @rei/ai probe:intent --live
```

Supply `ANTHROPIC_API_KEY` through the process environment; no environment file is loaded.
Explicit live execution without a key exits unsuccessfully before loading provider code. The
JSON result contains only dataset/model/prompt-version identifiers, safe case IDs/locales,
correctness, confidence, typed failures, latency in milliseconds and token counts.
The probe exits unsuccessfully for provider failure or incorrect classification.
Default tests and CI never enable it. Root strict type checking includes the intent probe and
all integration probes.

Usage evidence accepts only nonnegative safe-integer `usage.input_tokens` and
`usage.output_tokens` from the Messages API response; anything else is unavailable. Every
attempted request is counted, including failed ones. Coverage shows attempted, observed and
unavailable counts; token totals are null unless every call reported usage. The Messages API does
not return a price, so no monetary cost is reported and none is inferred from token prices. Zero
provider calls (the heuristic) have zero usage. Raw response bodies, errors, credentials and query
text are never reported. Latency is elapsed wall time measured with a monotonic clock; offline
fake timings verify arithmetic and are not provider benchmarks.

The reusable `price-explanation-facts-v1` corpus in
`packages/domain/src/ask/fixtures/price-explanation-facts-v1.ts` retains every exact-fact
permutation and adversarial PT/EN outcome. Existing decision and graph tests retain invalid
output and below/exact/above-threshold proofs. `receipt-model-explainer.test.ts`,
`receipt-model-resilience.test.ts`, `anthropic-language-model.adapter.test.ts` and
`ai-policy-matrix.test.ts` retain explanation fidelity, provider failure mapping and typed
failure-policy evidence. The `ask-intent-decision`, `ask-checkpoints`, `ask-model-explanation`
and `ask-delivery` integration campaigns retain real-service evidence for confirmation,
checkpoints, restart, receipt acceptance and idempotency.

No live run has been made against the direct classifier: live classification accuracy, stated
confidence, latency and token usage remain unmeasured, and offline fake accuracy is not evidence
of live accuracy. The single authorized live run on 2026-10-26 predates ADR 0029 and exercised the
retired gateway route; both fixed cases failed in its privacy phase before any classification, so
it carries no evidence about the current classifier.

Migration `6007_ask_unavailable_intents.sql` replaces only the routed-document predicate. Existing
price, historical tracer and prepared contracts remain unchanged. Durable reads and SSE replay the
same retained result; duplicate completion preserves one terminal event, outbox and inbox effect.
Previously retained failed non-price terminals remain failed with a null result when replayed.

After `pnpm run build`, run `pnpm run test:integration:ask-intent` for the complete deterministic
routed campaign. Its existing-style serial preparation script builds the four application/migration
images before the bounded test; the test tags them into a unique owned Compose fixture. The
aggregate `pnpm run test:integration` includes the same preparation. No live model is contacted.

## Combined routing and explanation (D-102)

`routed-text-explanation-v1` is an additional closed admission mode with the same owner capability,
creation replay, confirmation, cancellation and expiry rules. It retains the routed decision,
then adds `modelExplanation` only after `executeIntent` produced an authorized Market price.
The new `intent-price-explanation-v1` partition cannot read historical routing checkpoints.
Price completion requires the authoritative decision, tool receipt and accepted model artifact;
other combined states carry null explanation. Historical `routed-text-v1` never generates.
See [the explanation contract](api/ask-model-explanation.md#combined-routed-explanation-d-102).

The native `test:integration:ask-trace` campaign exports one causal trace through request,
outbox producer, broker consumer, AI run, executed nodes, real provider attempts, typed tool and
checkpoint operations. Queue and total duration start at persisted admission, including reclaim;
confidence/source/degradation/confirmation and validated usage are categorical or bounded.
Absent provider usage/cost is explicitly unavailable. The supported SDK exporter boundary drops
arbitrary names, URLs/SQL, error text, events, link metadata and resource text while preserving
IDs, parent edges, timings and safe outcomes. Provider SDK payload telemetry stays disabled.

On 2026-10-26 the full native campaign passed: PT/EN completion and SSE, retained low-confidence
confirmation across restart, accepted-artifact reclaim with unchanged reservations, unavailable
intent without generation, stale/cancelled authority and partition refusal, populated historical
upgrade, actual exported parent edges and the whole-export sensitive-value scan after SQL failure.
It passed again on 2026-11-13 on the direct Anthropic classifier, with the fixture's in-process
`fetch` behind the real SDK client and a retained `gateway-jev-v1` decision resumed after
migration 6010; see [the explanation contract](api/ask-model-explanation.md).
