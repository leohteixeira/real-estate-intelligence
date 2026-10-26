# Receipt-bound model explanations

`POST /api/v1/runs` accepts the explicit `text-price-explanation-v1` mode with the same
`threadId`, `placeId`, `query` and `locale` fields as [text admission](ask-tracer.md).
It requires the strong owner Bearer capability and `Idempotency-Key`; callers cannot submit
canonical inputs, model names, grants or explanation evidence. The query cap is 16,000 characters.
Extraction refusals return `422 price_input_refused`; accepted requests return `202` with queued
run/thread IDs. `GET /api/v1/ask/text-price-explanation-capabilities` reports admission availability.

## Results and grammar

The separate `price-explanation-v1` graph visits `validatedInputs`, `priceTool`, then
`modelExplanation`. Market extracts inputs, calculates and formats facts. Inspect, thread and
durable SSE expose `explanation: null` before successful completion and on failed/expired runs.
A completed run carries the immutable model-written artifact: full text, same-run Market receipt
ID, explanation/reservation IDs, actual model and route, locale, prompt/grammar versions,
privacy-evidence ID, measured output tokens and acceptance time. Historical modes have no
explanation field and retain their exact two-node `price-v1` evidence.

`price-explanation-facts-v1` accepts exactly the asking-price, area and price-per-square-meter
sentences, each once, in any order, separated by one space. For BRL 785,000.00 and 68 m², English
facts include `The asking price per square meter is BRL 11,544.12/m².`; Portuguese uses
`O preço anunciado por metro quadrado é BRL 11.544,12/m².`. Other figures, currencies, units,
spelled numbers, rounding, forecasts, opinions, commentary and malformed text are rejected.
The returned model text is never repaired or replaced with a synthesized answer.

## Provider, privacy and limits

Only AI receives `AI_GATEWAY_API_KEY`. Its vendor-free `LanguageModel` adapter uses pinned
`ai`/`@ai-sdk/gateway`, primary `anthropic/claude-haiku-5.5` and transient-only secondary
`deepseek/deepseek-v4-flash-0731`, exclusively through Vercel AI Gateway. Every request sets
`zeroDataRetention: true`, `maxRetries: 0`, bounded output and cancellation; payload telemetry is
disabled. The model prompt contains versioned instructions and this receipt's facts, never the
original question, thread history, run identity or grants.

A fixed public-text probe must obtain authenticated gateway routing acknowledgement before facts
are transmitted. Evidence is bound to the actual model/route and expires after 30 seconds. Unknown,
missing, stale, contradictory acknowledgement or warnings fail closed without secondary fallback.
This checks the [documented ZDR routing acknowledgement](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr),
not an independent retention attestation. Offline tests make no real provider calls.

The scoped `POST /api/v1/internal/ask/runs/:id/model-explanation` supports strict `get`, `reserve`
and `accept` envelopes under the fresh checkpoint grant. API/SQL fence run, execution, lease,
thread and receipt identity. Each outbound probe reserves 16 output tokens; generation reserves 224.
Aggregate reservations cannot exceed 1,000 per run and are never refunded after uncertainty.
Named resilience policies apply fallback, bulkhead, route-specific breaker, transient retry,
per-physical-request limiter and a 3.5-second attempt timeout, in that order. Each failed public
probe or facts phase gets at most two physical requests, with a fresh persisted reservation before
each one; successful phases and acceptance are never repeated by this policy. Retry uses full
jitter from a 100 ms exponential base capped at one second. Valid `Retry-After` is honored only
when both it and a complete attempt fit the original deadline; advice over 30 seconds suppresses
retry. A rolling ten-second allowance admits about 10% retries with two low-traffic retry slots
per model. Attempts and fallback still share the 1,000-token persisted run limit.

The original deadline and caller cancellation cover receipt recovery, queue admission, backoff,
reservation and HTTP, including clients that ignore cancellation. Expiration never yields a model
answer or fallback. Attempt timeout remains transient while the original deadline allows work.
Cancellation/policy/authentication/fidelity/budget refusals do not retry or fallback. Structured
exhausted quota immediately opens only its model/route circuit and prevents current-call secondary
spend. Local rate admission and definitive refusals do not record transient breaker outcomes.
Successful outbound phases taking at least 2.5 seconds contribute one slow breaker outcome while
returning their actual output. Accepted evidence persists before saver ACK; reclaim reuses it with
a rebound Market receipt and unchanged reservations. Exactly-once provider network delivery is not promised.
