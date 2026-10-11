# ADR 0023 — Structured Ask tracer and scoped authority

- **Status:** Accepted
- **Date:** 2026-10-11
- **Authority:** Accepted by the agent on the owner's behalf under the unattended-work mandate;
  external decision D-045. No production action is authorized.

## Context

Story 5.2 must prove the actual queued-run/outbox/worker/AI/typed-tool/terminal-stream path for
BRL 785,000 and 68 square meters. Prepared Ask fixtures and foundation execution exist but
deliberately provide neither that result nor durable state. Creation has no capability issuance
or safe lost-response replay protocol. ADR 0010 assigns Ask persistence to the API; ADRs 0011
and 0012 require one aggregate per transaction and atomic delivery effects. Full text routing,
checkpoint recovery, confirmation, quotas and explanations have separate stories.

## Decision

Introduce the additive, explicitly versioned `structured-price-v1` tracer. Public creation uses
integer BRL minor units and explicit area, not natural-language extraction. A real LangGraph
fixed decision invokes the typed HTTP tool; the backend Market facade alone calls the canonical
domain arithmetic. The golden result is 1,154,412 minor units/m² for 78,500,000 minor units / 68.
Reject nonfinite or unsafe arithmetic outcomes. No provider or explanation is involved.

Live contracts have their own discriminator and execution provenance. Keep prepared fixture
contracts strict, isolated, read-only and explicitly non-live. Catalogue grants cover only
fixtures. Advertise structured capability availability separately and truthfully.

The caller supplies a high-entropy Bearer capability on creation; only its digest is persisted.
Do not recover authority from an idempotency key. A retained keyed request fingerprint binds
the authority and accepted body: matching replay returns the same IDs with caller-known
capability; a changed body conflicts; foreign authority is denied without history disclosure.
An existing thread requires its capability. Preparing an idempotent thread is its own transaction;
the run transaction atomically persists queued state, first event, creation reservation and
`ask.run.requested`. A recoverable empty thread is preferable to a cross-aggregate transaction.
Durable run identity survives temporary idempotency/inbox/outbox retention.

All Ask state writes occur in the API. The worker consumes the retained request event and uses
a typed, single-attempt HTTP dispatch port for claim and terminal commit. Authentication uses
an HMAC proof scoped to the exact request-event/run/thread identity; the API also verifies
that identity against the retained run. A dedicated signing key exists only in API and worker,
never on the wire or in AI. It authorizes only this job lifecycle, not administrative operations,
arbitrary history, general tools or operator access. Missing configuration disables live creation
safely without breaking health, fixtures or collection. Fixed origins/paths, no redirects,
bounded contracts and named resilience protect every hop.

A persisted short claim fences stale workers and excludes concurrent execution within a thread.
The claim returns a fresh ephemeral tool grant; retain only its digest, exact operation, execution
identity and expiry. AI receives that grant through authenticated RunExecutor, not public thread
authority or dispatch signing key. The tool endpoint verifies the grant, active claim and immutable
inputs before invoking Market. A retained idempotent tool receipt ensures re-execution cannot
create a second result and lets terminal commit verify real backend evidence rather than trust
arbitrary AI output. Network execution never holds a SQL transaction or lease.

Terminal state, terminal run event, domain outbox event and consumer inbox marker commit in one
API transaction. Broker acknowledgment follows the successful response. Retained terminal
disposition suppresses execution on redelivery even after inbox/outbox pruning; replay restores
the inbox. Controlled shutdown/generation loss is recoverable, not fabricated terminal failure.
Resumable live SSE follows actual ordered database events using bounded cancellable polling;
notifications may later optimize wakeups, never replace persisted events. Cursor authorization
precedes headers. A broken transport cannot manufacture a persisted terminal event.

Use strict TypeScript/Vitest integration campaigns with real owned Compose services under
ADR 0020. Named policy configuration, sanitized telemetry and safe empty configuration are
mandatory. Do not change `.env*`, deploy, access VPS or enable real collection sources.

## Options considered

- Direct worker arithmetic: loses the AI graph and typed HTTP tool required by the verify.
- Relabel prepared fixtures or foundation evidence: falsely claims execution and durability.
- Build all natural-language behavior now: expands the tracer into later model, gate and quota work.
- Server-issued capability returned by idempotency-key lookup: risks authority retrieval after a
  lost response; caller-known authority makes replay explicit without storing plaintext secrets.
- Direct worker Ask SQL mutations: contradicts API ownership and splits state-transition policy.
- A broad global operator token: forbidden; event-scoped machine proofs and ephemeral tool grants
  provide only the capabilities this flow needs.

## Consequences

Clients must generate and retain a strong capability before creation. Thread preparation can leave
an empty thread after a failed run transaction; matching retries recover it. Dispatch depends on
API availability and adds a private typed HTTP protocol and key provisioning. Lease expiry and
receipt verification require failure/concurrency tests and prevent stale completion. Polling has a
bounded database cost until notification optimization. This tracer does not establish the later
full queue/quota policy, remote checkpoints, model explanation or general run-command lifecycle;
those increments must preserve the published contracts and retained delivery fences.
