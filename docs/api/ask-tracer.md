# Ask price tracer reference

The `structured-price-v1` mode is a real persisted Ask run, separate from the
[prepared fixture API](ask.md). It calculates BRL centavos per square metre from explicit inputs.
The separate `text-price-v1` mode extracts and validates explicit price/area mentions deterministically.
Neither mode invokes a model, confirms edits or enforces visitor quota. Both persist
[run-scoped graph checkpoints](ask-checkpoints.md). See
[ADR 0023](../../specs/adrs/0023-structured-ask-tracer-and-scoped-authority.md).

## Public routes and authority

| Method and path                           | Response parser                       | Authority                           |
| ----------------------------------------- | ------------------------------------- | ----------------------------------- |
| `GET /api/v1/ask/structured-capabilities` | Exact mode/availability/intent object | Public                              |
| `POST /api/v1/runs`                       | `parseStructuredAskAccepted`          | Strong Bearer and `Idempotency-Key` |
| `GET /api/v1/runs/:id`                    | `parseAskLiveRun`                     | Owning thread Bearer                |
| `GET /api/v1/threads/:id`                 | `parseAskLiveThread`                  | Owning thread Bearer                |
| `GET /api/v1/runs/:id/events`             | `parseAskLiveEvent` per SSE frame     | Owning thread Bearer                |

The caller retains a cryptographically generated capability, such as 32 random bytes encoded as
base64url. Wire capabilities contain 43–128 ASCII letters, digits, underscores or hyphens; length
validation alone cannot establish entropy. The API stores a SHA-256 digest, never the token.
Prepared catalogue grants cannot create or authorize real runs. Capability URLs are unsupported.
All public queries are rejected. IDs are canonical lowercase UUIDv7 strings.

Availability returns `{ "mode": "structured-price-v1", "available": true,
"intent": "price_per_square_meter" }` when dispatch is configured. It describes admission
configuration, not dependency readiness. Disabled admission returns 503 after authorization.

## Creation and idempotency

The closed request admitted by `parseStructuredAskCreate` is:

```json
{
  "mode": "structured-price-v1",
  "threadId": null,
  "placeId": null,
  "query": "Calculate the price per square metre from these inputs",
  "locale": "pt-BR",
  "inputs": {
    "priceMinorUnits": 78500000,
    "currency": "BRL",
    "areaSquareMeters": 68
  }
}
```

Every field is required. `threadId` is null for a new thread or an owned UUIDv7; `placeId` is null
or a valid place slug. Locale is `en` or `pt-BR`. The query is nonblank and at most 16,000
characters; it is retained in authorized history, not used for extraction. Price is a positive safe
integer in centavos. Area is finite, positive and at most 1,000,000 m². The rounded quotient must
also be a positive safe integer.

`Idempotency-Key` contains 16–128 ASCII letters, digits, underscores or hyphens. Success returns
202 with exactly `mode`, `runId`, `threadId` and `state: "queued"`; no capability is returned.
Replay returns the same acceptance IDs even after completion or temporary idempotency pruning.
Changed input under the same key returns 409; another capability returns 403. The global key digest
and immutable request fingerprint remain with the run.

Thread preparation is a separate recoverable transaction. Failure can leave an owned empty thread,
but never a partially accepted run. The run, first event, temporary idempotency record and requested
outbox event commit together. A retry reuses the prepared thread.

## Execution and persisted history

### Text admission

`GET /api/v1/ask/text-price-capabilities` reports the same configuration-only availability with
`mode: "text-price-v1"`. Text creation uses the same strong Bearer, idempotency key and run route:

```json
{
  "mode": "text-price-v1",
  "threadId": null,
  "placeId": null,
  "query": "What is the price per square meter for BRL 785,000.00 and 68 square meters?",
  "locale": "en"
}
```

All five fields are required; `inputs` and unknown fields are rejected with 400. Text queries are
nonblank, at most 16,000 characters and exclude ASCII control characters. Success returns 202
with the same four acceptance fields, but text mode. Market extracts and validates before any
thread/run/outbox preparation. A well-formed request with unusable inputs returns exactly:

```json
{
  "mode": "text-price-v1",
  "code": "price_input_refused",
  "reason": "missing_area"
}
```

This 422 response creates no persisted effects and does not echo the question. Reasons are closed:
`missing_price`, `missing_area`, `ambiguous_price`, `ambiguous_area`, `invalid_price`,
`invalid_area`, `unsupported_currency`, `unsupported_area_unit`, `unsafe_result`.

Grammar v1 associates digit tokens with `price`/`preço`/`valor`, BRL markers (`BRL`, `R$`,
`real`/`reais`), `area`/`área`, or square-metre units (`m2`, `m²`, `square meters`/`metres`,
`metros quadrados`). Explicit price labels default to BRL. Unrelated bedroom/street/year numbers
are ignored. EN uses comma grouping and decimal point; PT uses point grouping and decimal comma.
Grouping must be complete. Unsigned positive digits and unambiguous `k`, `mil`, `thousand`,
`million`/`millions`, `milhão`/`milhões` scales are supported; exact BigInt scaling precedes safe
centavo conversion. Sub-cent prices, signs, exponents, malformed numeric fragments, repeated scales,
multiple candidates and ranges are refused. Foreign currency codes beside a price/numeric mention
(including CHF/RUB/BTC), explicit `currency`/`moeda` declarations other than BRL, bare `$` and
non-square-metre units are refused, not converted. Unrelated uppercase words are not currency
markers. Numeric area and rounded result retain the same Market bounds as structured inputs.

The PT question `Qual é o preço por metro quadrado de um imóvel de R$ 785.000,00 com 68 m²?`
and the EN question above retain identical inputs and produce 1,154,412 centavos/m². Immutable
fingerprints include mode, exact question, locale and normalized inputs: changing wording while
keeping the numbers, or substituting structured mode, conflicts under the same key.

Text execution actually traverses `START → validatedInputs → priceTool → END`; structured
execution retains `fixedDecision → priceTool`. Text snapshots use `basis: "text-price-v1"` and
decision `source: "validated-text-v1"`. The validation node is not a model decision or confidence
claim. A thread containing both kinds reports `basis: "mixed-price-v1"`; each run keeps its own
basis. Both branches share the same fixed Market tool, fenced grants, receipt, durable SSE and
authorization. Prepared examples stay separate and non-live. Jev, confidence gates, explanations,
editable confirmations, quotas and UI are not part of text admission.

### Durable execution

The API owns Ask lifecycle SQL. A production RabbitMQ worker dispatches the retained requested
event through bounded authenticated API calls. A 30-second fenced claim serializes active work per
thread. Busy retry hints are at most one second so a completed sibling does not leave another
run waiting for its old lease expiry. Busy admission waits are cancellable and bounded separately
from the ten-second active
execution/commit budget. Replacement invalidates the previous execution and both tool/checkpoint grants.

The AI receives an ephemeral scoped grant and traverses the actual
`START → fixedDecision → priceTool → END` graph. Its fixed HTTP tool reaches the API's Ask tool
controller, which checks operation, event/run/thread identity, execution, expiry and original
inputs before calling the Market calculation facade. AI has no database, broker, object-store
or dispatch-secret access. The receipt is retained once per run and survives execution replacement.

Market uses `Math.round(priceMinorUnits / areaSquareMeters)`: 78,500,000 centavos divided by 68
produces 1,154,412 centavos/m², displayed as R$ 11,544.12/m² with English currency formatting.
The receipt identifies `provenance: "market-domain-v1"`. Completion compares returned evidence
semantically with that retained receipt, independent of PostgreSQL JSONB key order.

Snapshots use `basis: "structured-price-v1"`, not fixture metadata. States are `queued`, `running`,
`completed` and `failed`. A fixed decision records `source: "fixed-structured-v1"`; steps are
`calculating` then `completed` or `failed`. Completed runs retain original inputs and typed result.
Definitive dependency failure retains null result and terminal reason `execution_unavailable`.
Terminal snapshot, event, outbox and inbox effects commit atomically; broker acknowledgement follows
commit. Terminal replay restores a pruned inbox without invoking AI.

Transient transport failure, controlled cancellation and exhausted executor policies, including
the five-second attempt timeout inside the ten-second consumer budget, do not submit a failed
completion or acknowledge delivery.
They preserve the retained claim and receipt for fenced recovery through broker redelivery.
The graph saver resumes saved canonical state with fresh invocation authority. A completed graph
rebinds its retained receipt through the authorized tool before submitting current execution evidence.

## Durable SSE and errors

Streams poll persisted snapshots with bounded cancellation. Envelope and transport IDs match
`<runId>:v1:<sequence>`. Nonterminal events use `ask.progress`; a single explicit `ask.completed`
or `ask.failed` closes the stream. A same-run `Last-Event-ID` replays only later retained events.
Consumed terminal replay is an empty successful stream. Persistence survives API restarts; this
does not claim unlimited retention.

Authorization and cursor validation precede SSE headers. Foreign authority returns 403; malformed,
foreign-run, unsupported-version or future cursors return 400 JSON. A transport/poll failure after
headers closes the connection without inventing a business terminal; reconnect reads SQL.

| Status | Condition                                                               |
| ------ | ----------------------------------------------------------------------- |
| 400    | Invalid closed request, inputs, ID, query or cursor                     |
| 401    | Missing or malformed Bearer, including short fixture creation authority |
| 403    | Wrong owner, dispatch identity, execution or tool scope                 |
| 404    | Authorized missing read view                                            |
| 409    | Same idempotency key with different immutable request                   |
| 422    | Valid text contract with refused price/area extraction or arithmetic    |
| 503    | Admission disabled or transactional/dependency operation unavailable    |

Public errors use sanitized API envelopes and server-generated request identifiers. Tokens, queries,
grants, connection strings and raw dependency errors are excluded from diagnostics.

## Private boundaries and verification

Worker-only routes are `POST /api/v1/internal/ask/runs/:id/claim` and `/complete`.
`ASK_DISPATCH_SECRET` is configured only for API and worker. An HMAC proof binds version, event,
run and thread. AI tools use `POST /api/v1/ask/runs/:id/tools/price-per-square-meter` with a different
ephemeral Bearer. `AI_INTERNAL_TOKEN` authorizes the isolated execution endpoint in the
[RunExecutor reference](run-executor.md). No private capability substitutes for another scope.

The [integration guide](../testing/integration.md) describes the owned production Compose campaign:
golden calculation, replay, fencing, SQL constraints, transactional failure, durable SSE restart,
definitive AI failure, privacy and preservation of foreign Docker resources.
