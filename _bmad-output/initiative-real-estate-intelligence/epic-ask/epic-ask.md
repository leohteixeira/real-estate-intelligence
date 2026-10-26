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

- Implementation: story 5.13 ships the versioned offline decision/explanation evaluation pack
  and a strictly checked opt-in synthetic Jev probe. All 3,198 offline tests, affected coverage,
  build, strict typecheck, lint and independent quick review passed. The single live attempt
  failed policy in privacy: two public probes, no classifications or retries; live accuracy and
  spend remain unavailable. Production mechanisms and prior persistence evidence are unchanged;
  normal commit gates passed and story 5.13 is done
  (agent, on the owner's behalf, 2026-10-26).

- Implementation: story 5.11 completes the offline provider/dependency failure matrix with
  production Jev policy wiring, bounded per-physical retries, original deadlines, transient-only
  breakers, conservative fresh generative reservations and categorical telemetry. Native SDK
  transport/nonconforming error-envelope regressions close the single independent review finding.
  Final AI coverage passed 309 tests; unchanged receiver/worker/workspace proofs are reused by
  identity. Build, strict typecheck, lint and normal commit gates passed. No dependency, SQL,
  production or live provider change was required; story 5.11 is done
  (agent, on the owner's behalf, 2026-10-26).

- Implementation: story 5.8 now exposes public routed creation, retained-receipt confirmation and
  general cancellation through the existing versioned live API. Durable SSE continuation is proved
  after an observed complete frame and across API restart. The extended native campaign preserves
  its original matrix and proves atomic cancellation, SQL deadlines, post-lock authority, retained
  evidence and late-write fences. Direct changed cases (80), workspace coverage (3,097), build,
  strict typecheck, lint and the native campaign (223.46 seconds) passed. No migration, dependency,
  headless/UI, quota or production work was added. Independent quick review reported no findings;
  normal commit gates passed and story 5.8 is done
  (agent, on the owner's behalf, 2026-10-26).

- Decision: D-101 exposes `routed-text-v1` through the existing public live-run protocol,
  preserving caller-known strong capability and historical tracer/fixture contracts. Public routed
  confirmation binds the retained receipt; cancellation covers queued, running and awaiting work
  without a decision receipt. Existing SQL deadlines and the first terminal win; later cancellation
  returns that retained snapshot without another effect. The existing thread/execution fences reject
  post-cancel writes. SSE resumes strictly after the received cursor; already-consumed terminal and
  broken transport never manufacture a new terminal (agent, on the owner's behalf, 2026-10-26).

- Implementation: story 5.4 adds independent routed mode/graph versions, API-owned immutable
  decisions, deterministic degraded taxonomy fixtures and the fixed D-100 pause deadline. The
  original delivery remains deferred while awaiting; confirmation resumes the retained proposal
  with separately validated operands. SDK text projection and privacy verification stay inside AI;
  generic public commands/UI and typed unavailable results remain their planned later slices.

- Decision: D-100 / ADR 0008 resolves confirmation refusal as `cancelled`/`visitor_cancelled`
  and fixes expiry at ten minutes after the first PostgreSQL-clock pause, without renewal.
  Confirmation at the deadline is refused; it preserves the proposed decision and validates
  editable operands through Market. Query or intent changes require another run. A separate
  routed-text mode preserves historical tracers; durable decision receipts and the existing
  deferred delivery recover without another decision. Story 5.4 proves the application facade;
  generic public commands/headless integration remain 5.8 and typed unavailable results remain
  5.5. Non-executable labels retain provenance and fail `execution_unavailable` in this slice.
  D-012 / ADR 0020 override Nest stack examples; existing BMAD planning/handoffs supersede
  interactive planning defaults (agent, on the owner's behalf, 2026-10-26).
- Decision: D-050 / ADR 0027 opens an explicitly versioned text-price explanation graph while
  preserving historical tracers. A bounded PT/EN factual grammar, validated twice against the
  retained same-run Market receipt, prevents invented figures and unsupported prose. Persistent
  generation reservations survive retry/reclaim; accepted explanation receipts close recovery
  gaps. Gateway-only ZDR evidence comes from a fixed public capability probe before user-derived
  transmission, never a catalogue or configuration assertion; policy/cancellation fail closed.
  Tests use explicit fake composition, never production fake defaults. No Jev, quotas, UI or
  VPS work is advanced (agent, on the owner's behalf, 2026-10-12).
- Decision: D-049 / ADR 0026 defines three pending as three total nonterminal runs per thread.
  PostgreSQL-clock deadlines and numeric admission order fence concurrent creation, reversed
  delivery and expired-claim recovery. Honest queued expiry records an expired terminal without
  execution; bounded API maintenance materializes it with the worker stopped. Confirmed source
  queue deferral preserves genuine failure attempts and frees prefetch for other threads. A
  deadlettered running head remains recoverable and blocks successors under D-048; no automatic
  replay or fabricated terminal is introduced. Each transition changes one run per transaction,
  and additive migration preserves historical evidence. D-012 and ADR 0020 override Nest stack
  examples; BMAD planning/handoff overrides interactive planning defaults
  (agent, on the owner's behalf, 2026-10-12).
- Decision: D-048 / ADR 0025 makes graph checkpoints and pending writes API-owned and remotely
  saved through a run/event/thread/version-scoped contract with a separate fenced checkpoint
  grant. Canonical graph state excludes authority; synchronous same-thread recovery preserves
  actual node evidence and reauthorizes retained Market receipts. Transient interruption uses
  bounded durable redelivery, not a manufactured failed terminal. A turn is a terminal run:
  checkpoint lineage expires 30 days after first persistence and is retained for up to eight
  recent terminal turns plus unexpired active work. API maintenance preserves business terminal,
  receipts, SSE and replay fences; a durable marker refuses reset after pruning. Nullable reserved
  principal ownership stays null. Real three-process restarts and saver pause/resume must pass;
  Jev/public confirmation, quotas, model explanation, UI and VPS remain later increments. D-012
  and ADR 0020 override Nest stack examples; BMAD planning/handoff overrides interactive planning
  defaults (agent, on the owner's behalf, 2026-10-11).
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
- Decision: D-046 / ADR 0024 adds `text-price-v1` admission through the Market facade's
  deterministic PT/EN extractor, exact BRL normalization and typed 422 refusals before new
  persistence. Accepted text, locale, mode and canonical inputs bind replay and scoped grants.
  Text runs and mixed threads have truthful closed provenance; additive SQL preserves structured
  history. Only the existing fixed `price-per-square-meter` HTTP tool remains executable. This
  specialized text-input tracer does not claim Jev routing, its confidence gate, model explanation,
  full checkpoints or UI; those remain the subsequent increments. D-012 and ADR 0020 override
  Nest skill stack examples; the owner mandate overrides interactive planning defaults
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
