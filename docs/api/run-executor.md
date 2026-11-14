# Foundation RunExecutor reference

`POST /internal/v1/runs/execute` belongs to the isolated AI service on port 4111. Its `foundation`
step executes
the existing `START → noOp → END` LangGraph and returns observed node traversal. It does not
create a public Ask run, calculate a price, call a provider or tool, save a checkpoint, publish an
event, or claim durable completion or deduplication. The graph receives empty state; the question
is validated at the boundary and is neither used by the graph nor returned in the evidence.
The separately scoped `structured-price-v1` step invokes the [real price tracer](ask-tracer.md).
The guarantees and request/evidence shapes below describe the foundation step only.

## Authority and configuration

Only the worker and AI receive `AI_INTERNAL_TOKEN`. The value must contain 32–128 ASCII letters,
digits, underscores or hyphens. Set a generated value through the process environment; no fixed
development secret exists. An absent or empty value disables execution and preserves AI health
and normal collection startup. A supplied malformed token fails configuration with a fixed message.
The endpoint accepts exactly `Authorization: Bearer <token>` and compares equal-length bytes in
constant time. Authorization precedes JSON parsing. Public fixture capabilities and operator
tokens do not grant execution authority.

The worker also requires `AI_URL` when execution is enabled: an absolute HTTP(S) origin with no
credentials, query, fragment or non-root path. Compose supplies `http://ai:4111`. The adapter adds
the fixed endpoint path and refuses redirects. The AI has no infrastructure package or database,
broker or object-storage credentials. Its optional `AI_PORT` defaults to 4111.

## Request and evidence

The request is a closed object: extra or missing fields are rejected. `Content-Type` must be
`application/json`. JSON bodies are limited to 100,000 bytes.

```json
{
  "version": 1,
  "runId": "0197e4e0-0000-7000-8000-000000000001",
  "threadId": "0197e4e0-0000-7000-8000-000000000002",
  "step": "foundation",
  "query": "A synthetic question supplied through stdin",
  "locale": "en"
}
```

Both identifiers must be canonical lowercase UUIDv7 values. The only version is `1`, this
step is `foundation`, and locale is `en` or `pt-BR`. The query must be nonblank and at most 16,000
JavaScript characters. No idempotency or operation-key header is used or required.

A successful response is HTTP 200 with this closed evidence shape:

```json
{
  "version": 1,
  "runId": "0197e4e0-0000-7000-8000-000000000001",
  "threadId": "0197e4e0-0000-7000-8000-000000000002",
  "step": "foundation",
  "outcome": "foundation-executed",
  "visitedNodes": ["noOp"]
}
```

`visitedNodes` comes from actual LangGraph update keys. Missing, repeated or unexpected nodes
cannot produce accepted evidence. The worker requires a JSON response of at most 16,384 bytes
and validates version, shape, run/thread identity and step. Evidence contains no question, token,
public state, capability or analysis result.

## Failures and bounds

| HTTP status | Closed response                     | Condition                                                  |
| ----------- | ----------------------------------- | ---------------------------------------------------------- |
| 400         | `{"code":"bad_request"}`            | Invalid JSON or request contract                           |
| 401         | `{"code":"unauthorized"}`           | Missing, malformed or incorrect authority                  |
| 413         | `{"code":"bad_request"}`            | JSON body exceeds the byte limit                           |
| 415         | `{"code":"unsupported_media_type"}` | Non-JSON content type or unsupported charset/body encoding |
| 503         | `{"code":"unavailable"}`            | Execution disabled, interrupted or unavailable             |

The application port exposes only `ExternalFailure`: network/429/5xx failures are `transient`,
HTTP 401 is `unauthorized`, HTTP 403 is `forbidden`, and invalid requests/responses/redirects are
`rejected`. Caller cancellation is `cancelled`; expired policy deadlines, admission/rate/breaker
refusals and attempt timeouts are `exhausted`. Messages never include raw errors or authority.

The worker orders named policies as fallback, bulkhead, circuit breaker, retry, outbound rate
limit and attempt timeout. Fallback fails closed. Retry allows one attempt, including transient
failures: repeated invocation has no durable idempotency guarantee. Defaults admit three concurrent
calls and six queued calls (one-second admission wait), allow ten attempts per second with no rate
wait, and cap an attempt at 22 seconds. The breaker opens for 30 seconds after at least twenty
calls in ten seconds with a 50% failure rate; calls crossing 20 seconds also count as slow.
The AI caps the foundation graph at two seconds and a priced Ask graph at 20 seconds, and
propagates disconnect cancellation. [Ask tracer](ask-tracer.md#durable-execution) lists how these
budgets nest inside the claim lease.

## Explicit worker command

Build first with `pnpm run build`. Then pass a valid request JSON through bounded stdin to
`pnpm --filter @rei/worker run:foundation`, with configuration already supplied in the environment.
No question or token belongs in shell arguments. The executable preloads OpenTelemetry, resolves
`RUN_EXECUTOR` through Nest, and has no persistence, collection or broker module. The whole command
has a ten-second deadline covering stdin, startup, admission and execution; context and telemetry
cleanup each have a two-second bound. SIGINT and SIGTERM cancel execution. Every primary and cleanup
failure is preserved internally in sanitized form; the executable prints only a categorical failure.
Finalization owns pending context acquisition: a context arriving within the cleanup bound is closed,
and its close rejection is retained alongside the primary failure. Non-cooperating acquisition or
cleanup produces a retained timeout; no promise can be forcibly cancelled by that bound.

Compose also provides `run-execution-command` under the explicit `tools` profile. Start the owned
AI service first, then use `docker compose --profile tools run --rm --no-deps -T
run-execution-command` with JSON on stdin. The ordinary worker does not start foundation runs
automatically and gains no unconditional AI dependency. When structured dispatch is configured,
it consumes explicitly accepted structured runs, not fixture histories.

Successful execution prints one safe evidence JSON line; failure exits with code 1 and writes
`{"code":"foundation_execution_failed","kind":"<category>"}` to stderr. Public prepared Ask
reads continue to report `liveExecution: false`. See [the integration guide](../testing/integration.md)
for the production worker/AI campaign.
