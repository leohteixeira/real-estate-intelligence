# ADR 0025 — Run-scoped remote graph checkpoints

- **Status:** Accepted
- **Date:** 2026-10-11
- **Authority:** Accepted by the agent on the owner's behalf under the unattended-work mandate;
  external decision D-048. No production action is authorized.

## Context

Story 5.6 makes ADR 0010's checkpoint guarantees executable. Existing Ask threads, runs, events,
delivery identity and Market receipts are durable, but LangGraph has no saver. Persisting the
current graph input would store a plaintext ephemeral tool grant. Transient executor errors
currently become terminal failures. Installed LangGraph 1.4.21 resets the top-level checkpoint
namespace to the empty namespace, so a run-specific namespace alone cannot isolate sibling runs.

## Decision

All checkpoint SQL remains in the API-owned Ask adapter, behind an application port. The AI owns
the LangGraph `BaseCheckpointSaver` adapter and installed serialization bridge, never PostgreSQL,
broker, storage credentials or a dependency on `@rei/infrastructure`. The remote protocol has a
closed version-1 primitive envelope for bounded get/list/put/pending-write operations. It does
not re-export vendor types, accept arbitrary SQL/URLs or expose a public history/maintenance API.

Address storage by retained request-event/run/thread identity, graph version, validated namespace
and checkpoint ID. Preserve the actual canonical `thread_id`. Latest lookup is run-scoped even
when LangGraph uses the empty namespace. Parentage, channel versions and pending writes are
durable, not only state values. Ordinary keyed replay is immutable and idempotent; different
content conflicts. LangGraph's reserved negative pending-write slots retain their documented
replacement semantics under current authorization. Reject foreign parentage and historical
forking through this execution grant. Preserve full required lineage within the retention window.

Claims issue a separate random checkpoint grant. Store only its digest alongside the existing
tool-grant digest; bind both to the retained identity, current execution ID and claim expiry.
Authorize reads as well as writes, and serialize these checks with claim replacement and
terminal transitions through the existing thread lock. The tool grant cannot authorize saver
operations, and the saver grant cannot call tools, create a run or delete thread history. AI never
receives the worker dispatch signing key or public thread capability. Missing configuration stays
fail-closed without affecting foundation execution, collection or prepared Ask fixtures.

Create graph/saver instances per invocation so their nonserialized closure owns fresh execution
authority, cancellation and deadlines. Persist only canonical immutable business input and actual
node/effect evidence. Never serialize execution grants, request headers, callback/configuration
objects, signals or raw exception messages. Project saver addressing and metadata explicitly,
rather than storing `RunnableConfig`. Serialize the complete installed checkpoint representation
in bounded typed bytes at the AI boundary; API DTOs remain SDK-independent. Unknown/malformed or
oversized envelopes fail safely, and telemetry records only identifiers, operation and outcome.

Use synchronous LangGraph durability. Fresh execution supplies canonical input; interrupted
execution resumes latest with null input on the same thread and run. Reconstruct traversal
evidence from durable state, including previously completed nodes. A finished graph whose public
terminal commit was lost reacquires its retained Market receipt through the current authorized
tool, verifying unchanged receipt identity/result and rebinding the execution ID authoritatively.
A crash between a tool commit and its checkpoint reuses that same receipt on node redelivery.
Never edit stale receipt execution IDs locally to manufacture proof.

Transient network/5xx interruptions remain unsettled for existing bounded broker redelivery.
Definitive malformed evidence or authority failures retain safe terminal failure behavior. There
is still one HTTP adapter attempt; durable redelivery is not an unbounded in-process retry loop.
Persistent transport failure reaches the existing operational dead letter, not a fabricated
public terminal. Update the older unavailable-AI expectation explicitly and retain a distinct
definitive-invalid-authority terminal regression. This refines ADR 0023's initial tracer policy.

Retention has a fixed 30-day horizon from the run's first persisted checkpoint, measured with
database time. A turn means one terminal run, ordered by terminal time with ID tie-break; retain
the full checkpoint lineage of up to the latest eight such turns per thread, plus unexpired
active work. Do not count individual checkpoint rows as turns or refresh expiry on writes.
API-owned bounded, nonoverlapping, cancellable maintenance deletes only eligible graph payloads
and pending writes. Retain the terminal run, receipt, contiguous SSE events, request fingerprint
and delivery identity. Retained expiry/pruning markers prevent an old interrupted run from
silently starting a new graph after its state is removed. Expired active execution fails safely;
terminal public reads remain available. No retention permission is given to the AI.

Add `ask.thread.principal_id` as a nullable reserved identifier with no cross-schema foreign key.
Existing rows remain null; neither visitors nor machine grants can fill it. Published MVP
ownership still exposes `principalId: null`. Add a new migration without editing applied 6001
or 6002, changing historical documents or weakening their constraints.

## Options considered

- Direct AI database access breaks ADRs 0007, 0010 and 0011.
- Final-result persistence alone cannot resume a paused graph or recover pending writes.
- Run-specific top-level namespace alone is ineffective in the installed runtime.
- Persisting full execution/configuration input leaks ephemeral authority and restores stale claims.
- In-memory saver or manual terminal seeding cannot prove three-process restart durability.
- Removing run/event/receipt history during retention destroys existing replay and SSE guarantees.

## Consequences and verification

Remote persistence adds bounded HTTP work to every graph superstep. Named saver resilience settings
use ADR 0013's ordering and safe fallback, with one adapter attempt, bounded response streaming,
fixed origin/path and no redirects. Structured and text graphs share the existing bounded tracer
deadline; foundation keeps its smaller budget. No provider call or timeout inflation is needed.

Verify contracts, in-memory ports, actual saver serialization and pause/resume, grant separation,
stale execution and cross-run/thread rejection, parentage/pending-write replay, cancellation,
completed-before-terminal recovery, database-clock retention boundaries and populated migration
upgrade. Restart each production API/worker/AI process during a publicly created real run after
observing a committed checkpoint, using only fixture-owned SQL barriers and exact Docker labels.
Assert same run/thread, one Market receipt/effect, actual node continuity, retained request event,
one public terminal and replayable SSE. No production fault switch or manufactured completion.

All integration campaigns and probes are strict TypeScript with Vitest, Supertest and shared
Testcontainers ownership under ADR 0020. D-012 keeps explicit SQL, application ports and facades
above Nest skill ORM/NX/Jest defaults. General confirmation/Jev, quotas, queue expiry, model
explanations, UI, production and VPS verification remain their separate stories.
