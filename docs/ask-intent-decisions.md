# Routed Ask decisions

`routed-text-v1` is an internal application capability. `AskRunService.createRouted()` admits
text before deterministic operands are available. It preserves the three historical tracer
modes and uses the separate `intent-routing-v1` graph. Public commands and the Ask screen
remain a later slice.

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

Gateway Jev receives fixed closed criteria through the installed AI SDK decision capability.
The pinned Gateway evaluation alias takes a text state while the AI SDK normalizes text parts;
a narrow typed bridge projects only text into `doEvaluate`. No provider types cross the
application port. A fixed public probe must provide the existing Gateway ZDR routing
acknowledgement before visitor text is transmitted. Provider warnings are rejected before SDK
warning logging. Calls disable retries and payload telemetry, and share a bounded cancellation
signal. Selected-label probability comes from its distribution, independently of any provider
confidence. Invalid distributions and caller cancellation are rejected. Unavailable private
routing falls back to deterministic PT/EN `heuristic-v1`, with explicit degraded provenance and
the same confidence gate.

The offline corpus is `apps/ai/src/models/fixtures/ask-intents-v1.ts`. Unit tests exercise the
real pinned SDKs with intercepted HTTP, without contacting a model. The optional compatibility
probe uses only fixed public text and requires explicit execution after building:

```sh
pnpm --filter @rei/ai build
node apps/ai/scripts/probe-intent-decision.ts --live
```

Supply `AI_GATEWAY_API_KEY` through the process environment. The probe prints decision metadata
and never prints credentials or visitor text. It is excluded from ordinary verification and was
not run for this implementation.

Migration `6007_ask_unavailable_intents.sql` replaces only the routed-document predicate. Existing
price, historical tracer and prepared contracts remain unchanged. Durable reads and SSE replay the
same retained result; duplicate completion preserves one terminal event, outbox and inbox effect.
Previously retained failed non-price terminals remain failed with a null result when replayed.

After `pnpm run build`, run `pnpm run test:integration:ask-intent` for the complete deterministic
routed campaign. Its existing-style serial preparation script builds the four application/migration
images before the bounded test; the test tags them into a unique owned Compose fixture. The
aggregate `pnpm run test:integration` includes the same preparation. No live model is contacted.
