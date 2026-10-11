---
type: epic
title: 'Natural-language runs'
parent: initiative-real-estate-intelligence
covers: [CAP-10, CAP-11, CAP-12, CAP-13, CAP-14, CAP-15, CAP-16, CAP-17, CAP-18]
after: []
assignee: ''
risk: high
---

# Natural-language runs

## Description

The `ask` context and `apps/ai`: a question becomes a durable, typed, auditable run. The first
executable intent is the price per square meter; the other four are recognized and answered as
unavailable. It includes the headless web client that proves the HTTP and SSE contract.

## Outcome

For a public-demo visitor: a question in Portuguese or English returns the domain rule's value with
a labelled explanation and a run record; the signal is the second success signal of the spec.

## Requirements

The spec is the requirement source: children cite its ids CAP-10, CAP-11, CAP-12, CAP-13, CAP-14,
CAP-15, CAP-16, CAP-17, CAP-18. Where an id is shared with another epic, Description says which part
this epic delivers.

## Done when

1. A clear request completes with the value of `pricePerSquareMeter` and an explanation stating only
   what the tool returned; a request below 0.85 waits in `awaiting_confirmation` and resumes without
   a second decision call; the other four intents end as typed, unavailable results.
2. Restarting the API, the worker or the AI service mid-run loses no state; a redelivered command
   creates neither a second run nor a second tool effect; runs of a thread execute in order, at most
   three pending, a queued run expiring after two minutes.
3. The headless client creates a run with an idempotency key, follows the versioned SSE stream to an
   explicit terminal event and resumes it after a disconnect; a thread is refused without its
   capability, and the 21st question of a day and any run beyond the global cap are rejected with
   the reopening time.
4. `pnpm test` runs the failure matrix and the evaluation pack offline; the live probe runs only
   when explicitly enabled.
5. One trace links the request, the publish, the consume, the run, each node, the decision, the tool
   call and the generative call, with no prompt, response or credential in it.
6. The run completes on the deployed stack while the AI service holds no database, broker or storage
   credential.

## Boundaries

The `ask` context, `apps/ai` and the headless client under `apps/web/src/headless/`. Not the Ask
screens (epic-web), not the execution of the other four intents (epic-expanded-intents).

## References

- parent — `_bmad-output/initiative-real-estate-intelligence/initiative-real-estate-intelligence.md`
- spec —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/spec-real-estate-intelligence.md`,
  sections Capabilities and Constraints
- architecture —
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`;
  ADRs 0011, 0012 and 0013 under `specs/adrs/`
- constraint — ADRs 0007 to 0010;
  `_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md`,
  section Natural-language runs

## Notes

- Decision: this tracer runs in parallel with the data tracer (owner, 2026-10-10).
- Unknown: the global daily cap of runs; the quota entry asks the owner for its value.
- Waits on epic-platform-baseline because: it needs NestJS 12 without Mastra, the outbox and relay,
  the resilience composition and the Zero Data Retention ADR.
- Tracer bullet: entry 2; entries 1 and 17 precede it so epic-web opens on the contracts and the
  tracer has its worker-to-AI hop.
- Decision: D-043 delivers closed Ask request/response contracts and read-only, explicitly
  `prepared-ask-example` fixtures for all seven public states, full threads and edited inputs.
  `/api/v1/ask/capabilities` and `/ask/fixtures` expose synthetic availability/catalogue; thread,
  run and finite scripted SSE previews require the fixture's Bearer capability. Every preview
  reaches an explicit version-1 terminal event; fixture-only Last-Event-ID replay is not durable
  recovery. Creation, confirmation, cancellation, acceptance and quota rejection have typed
  shapes, not live POST handlers or quota counters. No arbitrary visitor text, model call, SQL
  write, outbox event or production durability is introduced. D-012 and ADR 0020 override the
  skill's Prisma/NX/Jest examples (agent, on the owner's behalf, 2026-10-11).
- Decision: D-044 introduces the authenticated worker-to-AI `RunExecutor` hop at
  `POST /internal/v1/runs/execute`. Its explicit `foundation` step actually traverses the existing
  no-op LangGraph and returns correlated `foundation-executed` evidence, not an analysis result
  or public terminal state. A worker one-shot command uses the same production DI port; durable
  dispatch, tools, providers and checkpoints remain their later stories. Missing internal token
  disables execution without breaking collection startup; only worker and AI receive the token,
  with ephemeral fixture configuration and no fixed secret or `.env` edit. Single-attempt HTTP,
  strict contracts, fixed destination/no redirects, bounded cancellation and ADR-ordered named
  policies protect the hop. Existing public Ask previews remain read-only and non-live
  (agent, on the owner's behalf, 2026-10-11).
- Decision: D-045 / ADR 0023 opens the real `structured-price-v1` tracer: caller-known strong
  thread capability, fingerprinted replay, API-owned queued state/event/outbox and claim/terminal
  writes, worker consumption through event-scoped dispatch proofs, fixed-decision LangGraph and
  a run/claim/input-scoped ephemeral typed HTTP Market tool. Retained tool receipts and run
  identity fence redelivery independently of inbox/outbox retention; terminal and inbox commit
  before broker ack. Live contracts and persisted resumable SSE stay separate from prepared
  previews. The golden 78,500,000 BRL minor units / 68 m² yields 1,154,412 minor units/m².
  No model, text extraction, remote checkpoint, full quota policy, UI or production action is
  claimed; missing dispatch configuration fails closed without changing collection or fixtures
  (agent, on the owner's behalf, 2026-10-11).
