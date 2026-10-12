# ADR 0026 — Ordered, bounded Ask delivery

- **Status:** Accepted
- **Date:** 2026-10-12
- **Authority:** Accepted by the agent on the owner's behalf under the unattended-work mandate;
  external decision D-049. No production action is authorized.
- **Extends:** ADRs 0010, 0017, 0023 and 0025.

## Context

Story 5.7 requires serial ordered execution within a thread, independent-thread progress, three
pending runs, two-minute queue expiry and redelivery without duplicate runs or effects. Existing
claims exclude a currently leased execution but do not enforce persisted admission order. A
younger delivery can overtake interrupted recovery after the older lease expires. Busy handlers
poll for forty seconds, occupy the consumer's prefetch slots and then consume the ordinary
failure budget. Strict FIFO alone would worsen this head-of-line problem.

The spec defines `queued -> expired`. Existing tracer contracts instead admit only completed
and failed terminals, both requiring executed decision/calculation history. Inventing execution
to fit those shapes would contradict the product and its evidence guarantees.

## Decision

### Admission and order

Pending means every nonterminal run, including the active execution. The initial bound is three
total per thread, not three queued plus one running. A fourth new request receives HTTP 429 with
the closed body `{code: 'thread_pending_limit', limit: 3}`. This is not the daily/global quota
contract and advertises no invented reopening time. Foreign authority is refused before capacity
disclosure or history mutation. Matching authorized creation replay returns original IDs before
capacity checking; changed content conflicts. The accepted response acknowledges the original
admission; authenticated run inspection exposes its current state.

Use the canonical thread advisory lock for admission, claim, tool, checkpoint and terminal
linearization. Allocate a persisted numeric bigint admission sequence while holding that lock;
sequence gaps on rollback are harmless. One PostgreSQL clock observation defines admission time
and a fixed queue deadline exactly 120 seconds later. Replay, retry and reads never extend it.
The lowest admission sequence among nonterminal runs is the execution head. Its expired running
lease permits reclaim of that head, never execution of a younger sibling. Public thread order
uses the same underlying numeric sequence, not UUIDs, application clocks or cast text aliases.

Retain one-aggregate-per-transaction boundaries. Thread preparation remains separately recoverable.
Authorized stale-run cleanup before admission uses individual run transactions; the new-run
transaction does not terminalize its siblings. Recheck authority and capacity under the thread
lock at final admission. Never hold SQL locks during network execution.

### Truthful queue expiry

Only queued runs expire at `queue_expires_at <= clock_timestamp()`. Add a closed `expired`
terminal with reason `queue_expired`, null decision/result and one step `{sequence: 1, phase:
'expired', at}`. No execution identity, claim, tool/checkpoint grant, receipt or checkpoint is
created. The terminal's timestamp is the SQL transition time; the fixed deadline defines
eligibility rather than a promise that maintenance runs in that exact millisecond.

The single-run transaction commits expired state, one contiguous `ask.expired` SSE frame,
`ask.run.expired` outbox and the retained request identity's consumer inbox marker. Terminal
redelivery returns that same history and restores a pruned inbox without graph execution. Claim
checks expiry before issuing authority. Preserve strict completed/failed state predicates and
original input/basis/history agreement rather than weakening them to admit the new branch.

An API-owned maintenance job materializes expiry even when worker and broker are stopped. It
runs nonoverlapping one-second cycles, at most 100 transitions per cycle and a five-second
cancellable deadline. Bound candidate selection and rotate the scan frontier; skip busy threads
and recheck eligibility under the thread lock so a locked head cannot starve unrelated expiry.
Each expired aggregate commits independently. Shutdown cancels only owned work. Telemetry uses
fixed operation/outcome/count fields, never questions, payloads, credentials or raw SQL errors.

The checkpoint retention definition of a terminal turn includes expired runs, whether or not
they have checkpoint payloads. Its eight-turn and thirty-day rules otherwise remain unchanged;
business runs, receipts, replay identity and SSE history remain retained.

### Scheduling is not failure

Extend the application subscriber protocol with an explicit successful deferred disposition.
Ask returns it promptly for legitimate thread-order or active-claim waiting and invokes neither
the executor nor terminal completion. Existing handlers returning void remain compatible.

The broker handles deferral separately from rejection. Wait an abortable bounded one second,
then transfer the original envelope persistently and mandatorily to the tail of its source
queue. Preserve the current failure-attempt counter, including previously accumulated genuine
failures. Mark the transfer as admission-deferred. Acknowledge the source only after publisher
confirmation. Failed, unroutable or ambiguous transfer retires the generation and leaves the
source unsettled; it must not enter normal handler-retry accounting or reset that accounting.
Preserve bounded cancellation/drain and at-least-once idempotency across generation loss.

Ordinary failures retain ADR 0017's five-normal-failure limit and durable dead letter. Do not
replay dead letters automatically. ADR 0025 remains binding: persistent transport failure leaves
the older running run recoverable, not artificially failed. Strict FIFO therefore keeps its
successors blocked until authorized operational recovery; queued successors can expire normally.
Independent threads must still make progress through the actual production worker subscription.

### Additive compatibility

Add migration 6004 without editing applied 6001–6003 or rewriting historical documents, events,
receipts, fingerprints or delivery identity. Backfill order deterministically from existing run
identity order and admission/deadline metadata from retained creation time; allocate new numeric
sequences beyond the backfill frontier. Historical completed/running evidence stays unchanged.
Upgrade fixtures seed genuine historical schemas explicitly, not through production schema
detection or compatibility fallback. Existing structured/text graphs, grant fencing and durable
pending writes remain intact.

## Options considered

- Three queued plus one active allows a fourth unfinished run; choose the explicit three-total
  resource bound instead.
- Broker FIFO, UUIDv7 ordering and JavaScript timestamps do not prove admission order across
  concurrent API instances and reversed/redelivered commands.
- Long in-handler polling consumes prefetch and treats correct scheduling as failure.
- Immediate reject/requeue can hot-loop and starve the predecessor. A new TTL queue topology
  introduces reliability and migration choices unnecessary for the existing confirmed protocol.
- Failing an unclaimed queued run manufactures decision/execution evidence. The spec already
  supplies the honest expired state.
- Skipping a deadlettered running predecessor breaks ordered recovery; fabricating its terminal
  contradicts ADR 0025. Keep this operational limitation explicit.

## Consequences and verification

The three-total bound is deliberately conservative. Deferred deliveries use repeated bounded
confirmed transfers while waiting; expiry bounds queued waiting independently of failure count.
Public expired runs retain replayable truthful terminals without invoking AI. Maintenance adds
bounded API SQL work and does not promise instantaneous terminal materialization at the deadline.

Prove concurrent fourth-request refusal and keyed replay at capacity through public HTTP. Publish
existing requested identities in reverse order through real RabbitMQ and prove numeric FIFO and
independent-thread progress with production prefetch, plus a prefetch-one case. Observe more than
five deferrals without consuming genuine failure attempts. Recover an expired running lease
before successors while retaining one Market receipt and actual graph state. Verify SQL-time
expiry boundaries, autonomous stopped-worker expiry, transaction rollback/cancellation, retained
SSE/inbox replay, populated 6003-to-6004 upgrade and actual fifth-failure DLQ behavior. Retain the
three-process checkpoint campaigns and all unchanged quality/coverage gates.

D-012 and ADR 0020 override Nest skill ORM/NX/Jest examples: explicit SQL, application ports,
facades and strict TypeScript/Vitest remain mandatory. Jev, confirmation, quotas, explanations,
UI, real sources and VPS work remain separate stories.
