# Ask graph checkpoint reference

`POST /api/v1/ask/runs/:id/checkpoints` is the private, API-owned saver RPC for
`price-v1`. It returns 200 only after the transaction commits. No delete route exists.
See [ADR 0025](../../specs/adrs/0025-run-scoped-remote-graph-checkpoints.md).

## Authority and addressing

Every JSON request has exactly `version: 1`, UUIDv7 `eventId`, `runId`, `threadId`,
`executionId`, `graphVersion: "price-v1"`, `namespace` and the operation fields below.
Path and body run IDs must agree. Query parameters are forbidden. Namespace is a
safe framework identifier up to 256 characters; task/channel identifiers allow
1–128 characters. Checkpoint IDs are canonical installed-SDK UUID6 or UUIDv7.

Bearer contains the distinct ephemeral `checkpointGrant`, never a body field.
Public owner, dispatch and tool grants cannot substitute. Every operation, including
an empty get/list, checks the retained requested identity, running state, current
execution, database-time claim expiry and checkpoint-grant digest under the thread
lock. Fresh claims rotate independent tool and checkpoint grants atomically.

| Operation    | Additional exact fields                              | Response                              |
| ------------ | ---------------------------------------------------- | ------------------------------------- |
| `get`        | `checkpointId` (ID or null for latest)               | `{operation:"get",record}` (nullable) |
| `list`       | `beforeId` (exclusive ID or null), `limit` (1–20)    | `{operation:"list",records}`          |
| `put`        | `checkpointId`, `parentId`, `checkpoint`, `metadata` | `{operation:"put",saved:true}`        |
| `put-writes` | `checkpointId`, `taskId`, `writes`                   | `{operation:"put-writes",saved:true}` |

Bytes are exactly `{type:"json"|"bytes",base64}` with canonical base64. A record
contains checkpointId, parentId, checkpoint, metadata and pendingWrites. Each write
contains index, channel, value; returned writes also contain taskId. Ordinary slots
0–31 are immutable; reserved error/scheduled/interrupt/resume slots -1/-2/-3/-4 may
be replaced by a fenced current execution. Checkpoint replay must match exact
content; new parent must be the current scoped head. Foreign IDs and forks refuse.

## Bounds, lifecycle and failures

Decoded limits are 256 KiB checkpoint/value and 4 KiB metadata. Requests allow
32 writes and 768 KiB serialized JSON; retained encoded pending writes are capped
at 1 MiB per checkpoint. Responses are capped at 8 MiB, so sequence-descending
lists may return fewer records. Other API routes retain their 100 KiB parser limit.

First checkpoint fixes a 30-day horizon. API retention runs every 60 seconds,
up to 50 runs with a five-second deadline, retaining unexpired active lineage and
the latest eight terminal turns, including completed, failed and queue-expired runs. An expired
turn consumes one terminal position but owns no checkpoint or pending writes; it can therefore
reduce the number of retained checkpoint-owning turns below eight. Running heads remain active
even after their original queue deadline or execution lease expires.
Expiry/pruning markers prevent an empty reset;
business runs, events, receipts and replay fences are preserved. AI uses sync
durability and null-input resume; actual saved node evidence survives replacement.
Completed recovery verifies an authorized tool-rebound retained receipt.

Malformed input/state returns safe 400; missing/malformed Bearer 401; foreign,
stale or expired authority/state 403; conflicting replay/fork 409; oversized JSON
413; wrong content type 415; unavailable persistence 503. Transient transport and
cancellation remain recoverable; definitive corrupt/forbidden state fails safely.
