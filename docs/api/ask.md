# Ask prepared fixture API

Ask exposes read-only prepared examples under `/api/v1`. Its snapshots and finite scripted SSE
previews are separate from the [real structured price tracer](ask-tracer.md). They do not create runs,
invoke
AI, count quota, persist events or guarantee durable reconnect recovery. Availability explicitly
reports `mode: "prepared-fixtures"` and `commandHandlers: false`.

## Endpoints and authority

| Method and path                | Public parser                              | Authority                     |
| ------------------------------ | ------------------------------------------ | ----------------------------- |
| `GET /api/v1/ask/capabilities` | `parseAskAvailability`                     | Public synthetic availability |
| `GET /api/v1/ask/fixtures`     | `parseAskFixtureCatalogue`                 | Public synthetic catalogue    |
| `GET /api/v1/runs/:id`         | `parseAskRun`                              | Bearer fixture capability     |
| `GET /api/v1/threads/:id`      | `parseAskThread`                           | Bearer fixture capability     |
| `GET /api/v1/runs/:id/events`  | `parseAskProgressEvent` for each SSE frame | Bearer fixture capability     |

All query parameters are rejected, including empty or unknown parameters. Run and thread IDs are
canonical lowercase UUIDv7 values. Unprefixed `/ask`, `/runs` and `/threads` read paths return the
canonical 404 response; the version prefix is required.

The catalogue contains exactly one item for each public state, in this order: `queued`, `running`,
`awaiting_confirmation`, `completed`, `failed`, `cancelled`, `expired`. Each item contains `runId`,
`threadId`, `state` and `grant: { scope: "synthetic-fixture", capability }`. Grants are deliberately
public and authorize only their prepared synthetic history, including its earlier thread run. They
are not credentials for real histories or future principal ownership.

Send the capability as `Authorization: Bearer <capability>`. The token consists of 16–128 ASCII
letters, digits, underscores or hyphens. Capabilities never belong in a URL or SSE frame. Missing or
malformed authorization returns 401; a wrong capability or unknown resource grant returns 403 before
history disclosure. Invalid IDs, queries and replay cursors return canonical 400 JSON before stream
headers. An authorized missing view returns 404. Unexpected failures are sanitized; error responses
carry the standard server-generated request identifier.

## Closed public schemas

All objects are closed: every declared property is required, and extra properties at any nested
level are rejected. JSON enters each public parser as `unknown`; invalid values throw a fixed
generic `TypeError`, without reflecting the payload. Wire types and parsers are exported from
`@rei/contracts`.

Availability, catalogue, run, thread and SSE envelopes share this example label:

```json
{
  "basis": "prepared-ask-example",
  "metadata": {
    "fixtureVersion": "ask-v1",
    "asOf": "2026-10-11T12:00:10.000Z",
    "synthetic": true,
    "liveExecution": false,
    "durableReplay": false
  }
}
```

Dates are canonical UTC wire dates with milliseconds, such as `2026-10-11T12:00:10.000Z`.
Monetary values are positive safe-integer BRL centavos, never
floating-point reais. Area is finite, positive and at most 1,000,000 square metres. Query/question
strings are nonblank and at most 16,000 characters. Locale is `en` or `pt-BR`.

| Shape              | Required fields beyond the shared label                                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Availability       | `mode`, `commandHandlers`, ordered `intents` with `intent` and `available`                                                                                                                                      |
| Catalogue          | `items`, each with `runId`, `threadId`, `state` and `grant`                                                                                                                                                     |
| Run                | `id`, `threadId`, nullable `principalId`, `question`, `locale`, nullable `placeId`, `createdAt`, `updatedAt`, `state`, nullable `originalInputs`, `decision`, `confirmation`, `result`, `terminal`, and `steps` |
| Thread             | `id`, nullable `principalId`, and full ordered `runs`, not run summaries                                                                                                                                        |
| Inputs             | `priceMinorUnits`, `currency: "BRL"`, `areaSquareMeters`                                                                                                                                                        |
| Decision           | `intent`, `confidence`, `degraded`, `requiresConfirmation`, `source: "synthetic-fixture"`, `decidedAt`                                                                                                          |
| Confirmation       | `intent: "price_per_square_meter"`, `inputs`, `confirmedAt`, `source: "recorded-synthetic"`                                                                                                                     |
| Price result       | `kind: "price_per_square_meter"`, `minorUnits`, `currency: "BRL"`, `areaUnit: "m2"`, `inputs`, `computedAt`                                                                                                     |
| Unavailable result | `kind: "unavailable_intent"`, `reason: "not_available"`                                                                                                                                                         |
| Step               | Positive contiguous `sequence`, `phase`, `at`                                                                                                                                                                   |
| Terminal           | `state`, nullable categorical `reason`, `at`                                                                                                                                                                    |

Nullable `principalId` reserves ownership without pretending that real ownership exists. Thread runs
have unique IDs, increasing creation times and the same thread/principal/fixture scope. Decision
intent is `price_per_square_meter` or `unavailable`; confidence is between zero and one. Step phases
are `interpreting`, `awaiting_confirmation`, `confirmed`, `calculating`, `completed`, `failed`,
`cancelled` or `expired`. Relationships between state, step order, confirmation time, result inputs
and terminal markers are validated, not merely their individual field types.

## Snapshots and scripted previews

A GET run response is the fixture's prepared phase. Opening or replaying its preview does not change
that snapshot. Threads include an earlier completed unavailable-intent example plus the requested
prepared run, preserving the earlier run's full content.

| Prepared state          | Scripted preview states                     | Final event / reason                   |
| ----------------------- | ------------------------------------------- | -------------------------------------- |
| `queued`                | queued → running → completed                | `ask.completed` / null                 |
| `running`               | running → completed                         | `ask.completed` / null                 |
| `awaiting_confirmation` | awaiting_confirmation → running → completed | `ask.completed` / null                 |
| `completed`             | completed                                   | `ask.completed` / null                 |
| `failed`                | failed                                      | `ask.failed` / `fixture_failure`       |
| `cancelled`             | cancelled                                   | `ask.cancelled` / `visitor_cancelled`  |
| `expired`               | expired                                     | `ask.expired` / `confirmation_expired` |

The awaiting-confirmation example has degraded confidence 0.64, below 0.85, and no computed result.
Its preview includes an already-recorded synthetic confirmation, not a live visitor action. Original
inputs remain 80,000,000 centavos and 80 m²; confirmed edited inputs are 81,000,000 centavos and 90
m². The completed result uses the edited inputs and reports 900,000 centavos/m². Reads retain the
question and both input versions; the pause never contains a result.

## SSE and fixture replay

Streams use `text/event-stream`. Each JSON envelope contains the shared label plus `version: 1`,
`id`, `runId`, positive `sequence`, `event`, `terminal` and a full `run`. The transport `id` and
`event` fields exactly match their JSON counterparts. Nonterminal events use `ask.progress`;
terminal events use `ask.completed`, `ask.failed`, `ask.cancelled` or `ask.expired` and agree with
the run's terminal state. Every full preview emits exactly one explicit terminal event and closes
physically, with no later contradictory frame. Disconnecting unsubscribes from the finite source.

Event IDs are stable `<canonical-run-uuid>:v1:<sequence>` strings. The following is transport
framing only; the data placeholder must be replaced by the complete closed envelope:

```text
id: 0199c8f2-2394-7000-8000-000000000003:v1:1
event: ask.progress
data: <complete AskProgressEvent JSON>

```

Send `Last-Event-ID` with an exact same-run ID to receive only later sequence numbers. Sequence must
be a canonical positive decimal without leading zeros and must exist in that fixture's preview.
Foreign IDs, other versions, future/zero sequences and trailing controls return 400 before SSE
headers. A consumed terminal produces an empty successful stream. This proves fixture replay only:
metadata always declares `durableReplay: false`.

All prepared frames are validated before streaming. A post-start source failure becomes a typed
`ask.failed` terminal with categorical `preview_unavailable`, not a raw exception or generic SSE
error containing private details.

Read the catalogue and copy the awaiting-confirmation fixture's public capability into the shell
variable `fixture_capability` before opening its stream. No real-history credential is required.

```bash
curl http://localhost:8200/api/v1/ask/fixtures
curl -N http://localhost:8200/api/v1/runs/0199c8f2-2394-7000-8000-000000000003/events \
  -H "Authorization: Bearer ${fixture_capability}" \
  -H 'Last-Event-ID: 0199c8f2-2394-7000-8000-000000000003:v1:1'
```

## Reserved commands: shapes only

These parsers freeze the prepared examples' command shapes. Prepared grants cannot create or
mutate live runs. The separate configured [live Ask API](ask-tracer.md) handles creation and its
routed modes handle confirmation/cancellation under strong thread authority. The fixture API
does not accept caller text, issue accepted responses, retain submitted queries or enforce quota.

| Parser                   | Closed shape                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `parseAskCommandHeaders` | `{ idempotencyKey }`: reserved `Idempotency-Key`, required 16–128 ASCII letters/digits/underscores/hyphens |
| `parseAskCreateRequest`  | `{ threadId, placeId, query, locale }`: nullable canonical thread ID/place slug and bounded query          |
| `parseAskConfirmRequest` | `{ intent: "price_per_square_meter", inputs }`: proposed intent and edited price/area                      |
| `parseAskCancelRequest`  | `{ reason: "visitor_cancelled" }`                                                                          |
| `parseAskAccepted`       | `{ runId, threadId, capability, state: "queued" }`                                                         |
| `parseAskQuotaRejection` | `{ code: "quota_exceeded", scope: "visitor" or "global", reopensAt }`: UTC reopening instant               |

The header parser accepts a normalized header contract object; it is not an HTTP middleware or a
runtime idempotency implementation. The separate live API implements the shared browser/global
calendar-day quota policy; prepared reads and scripted SSE never consume its allowance.

## Verification

Build before running the focused production-image campaign:

```bash
pnpm run build
pnpm run test:integration:ask
pnpm run test:integration
```

The Ask campaign exercises all seven actual HTTP/SSE journeys, public parsers, full threads, edited
inputs, authority/refusals, replay and absent POST handlers. A distinct API E2E test starts from the
catalogue grant and reaches the edited-confirmation terminal. Both use owned production Compose
PostgreSQL/migrations/API images, compare all owned table counts and content digests, and preserve
unrelated Docker resources. See [integration testing](../testing/integration.md).

## Headless live client

`apps/web/src/headless/ask-client.ts` exports `createHeadlessAskClient` and `followLiveAsk`;
`ask-session.ts` exports `LiveAskSession`. This client admits `routed-text-v1` and
`routed-text-explanation-v1` through the strict live contracts. The prepared UI client above keeps
its existing behavior. The caller supplies the public base URL (including any deployment prefix),
a strong capability, an explicit creation key and each operation's `AbortSignal`. The client does
not generate or persist credentials. Browser callers own capability and key retention and should
keep them out of URLs and logs.

```ts
import { createHeadlessAskClient, followLiveAsk } from './headless/ask-client.js';
import { LiveAskSession } from './headless/ask-session.js';

const client = createHeadlessAskClient('/real-estate-intelligence');
const accepted = await client.create(
  {
    mode: 'routed-text-v1',
    threadId: null,
    placeId: null,
    query: 'What is the price per square meter for BRL 785,000 and 68 square meters?',
    locale: 'en',
  },
  capability,
  creationKey,
  signal,
);
const session = new LiveAskSession(accepted);
await followLiveAsk(client, session, capability, signal, (run) => renderSnapshot(run));
```

`run` and `thread` inspect live history; their returned values do not advance the session. For a
paused run, `confirm({ runId, decisionReceiptId, inputs }, capability, signal)` accepts the retained
decision with validated edited inputs; `cancel(runId, capability, signal)` sends
`visitor_cancelled`. Command responses do not manufacture stream completion. Disconnect by
aborting the subscription signal; reconnect with a new signal and the same session. Its cursor
advances only after a complete valid ordered envelope, and `followLiveAsk` sends it as
`Last-Event-ID`. An aborted subscription preserves evidence without cancelling the server run.

The session retains its latest snapshot, cursor and serialized frame. An exact latest-frame replay
is suppressed; changed duplicates, older events, gaps and changed identity/evidence fail closed.
The server's continuation contract is strictly after the cursor. Snapshot values are copies, and
confirmation may legitimately transition back to queued. Only explicit completed, failed,
cancelled or expired SSE envelopes make the session terminal. Premature EOF allows at most one
automatic continuation; malformed envelopes are not retried. Reads and next-frame waits use the
shared ten-second deadlines and bounded UTF-8/SSE framing. Refusals preserve their HTTP status in
`ApiReadError` with a fixed safe message and validated request ID; response bodies are not exposed.

The focused native command is `pnpm run test:integration:ask-headless` after workspace build and
image preparation. It proves the imported client against owned synthetic services, including edited
confirmation, retained decisions and cancellation. Unit tests additionally cover public prefixes,
all terminal variants, malformed/stalled transport, replay and abort. This does not establish a
visual experience, durable browser credential ownership, live-provider behavior or production
availability.
