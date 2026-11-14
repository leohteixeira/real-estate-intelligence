# ADR 0024 — Deterministic text price admission

- **Status:** Accepted
- **Date:** 2026-10-11
- **Authority:** Accepted by the agent on the owner's behalf under the unattended-work mandate;
  external decision D-046. No production action is authorized.

## Context

Story 5.3 replaces caller-supplied tracer inputs with price/area extraction and validation by code
in Portuguese and English. Market owns the calculation and must also own normalization policy.
ADR 0023's persisted original inputs bind creation replay, scoped tool grants and receipts.
Persisting invented temporary inputs would break that authority chain. Typed Jev routing,
confirmation and model explanation are separate stories, not prerequisites of this extraction
increment. This ADR adds a specialized text-input capability; it does not supersede ADR 0008.

## Decision

Add explicit `text-price-v1` public creation alongside `structured-price-v1` at
`POST /api/v1/runs`. Text requests contain thread/place identifiers, original question and locale,
never authoritative numeric inputs. Ask application orchestration calls the public Market
calculation facade, which exposes a pure versioned extractor and canonical arithmetic validation.
Accepted canonical inputs are persisted before outbox dispatch or issuing a tool grant.

The supported grammar uses digit-written numbers with full-token locale-specific validation:
Portuguese grouping dots and decimal commas; English grouping commas and decimal dots;
ungrouped integers in either locale. Associate price with BRL currency or explicit price labels,
and area with area labels or square-meter units. Support R$, BRL and reais, default BRL when
no currency is stated, m²/m2 and spelled-out square-meter units, reversed input order, and
unambiguous thousand/million scales (`mil`, `thousand`, `milhão`, `milhões`, `million`, `k`).
Compute minor units exactly, not by stripping punctuation or rounding unsupported monetary
precision. Do not infer price/area from unrelated bedroom counts, dates or identifiers.

Missing or competing candidates, ranges, negative/zero values, malformed grouping, signed or
exponent fragments, unsupported currency/unit, unsafe values and unsafe rounded calculation
results produce a closed typed refusal. No currency conversion or silent first-match selection
is allowed. Monetary values must yield exact safe positive integer BRL minor units; area must
meet the existing positive finite square-meter bound. The extractor does no I/O or model call.

Malformed request contracts remain 400. Valid text contracts with refused extraction return 422
with exactly `{mode: 'text-price-v1', code: 'price_input_refused', reason}`. The finite reason
set distinguishes missing/ambiguous/invalid price and area, unsupported currency/area unit and
unsafe result. Refusal does not echo question content and occurs before any new thread, run,
outbox, receipt or remote execution. Existing authentication/configuration errors remain intact.

Persist the original question/locale, extracted immutable inputs and truthful text-mode basis.
Text runs use `text-price-v1` and `validated-text-v1` decision provenance, not a fixed structured
decision or fabricated Jev probability. Text graph evidence records `validatedInputs` and
`priceTool`. A thread containing only text runs uses `text-price-v1`; mixed live threads use
`mixed-price-v1`; exclusively structured threads keep their existing basis. Strict parsers must
correlate basis, decision source and execution evidence rather than admit arbitrary combinations.
Prepared fixture and foundation protocols remain separate and unchanged.

The retained request fingerprint binds mode, original question, locale, thread/place and derived
inputs. Same-authority matching replay returns existing IDs; changed text conflicts even when
it extracts identical numbers. Foreign authority never recovers history from an idempotency key.
Add an SQL migration without editing applied migration 6001 or rewriting historical evidence.
Retain exact document keys, immutable numeric-column agreement, state/history and receipt checks.

Preserve the one allowlisted typed tool: `price-per-square-meter`. Fixed HTTP destinations,
closed operation names, run/event/thread/execution/input-scoped ephemeral grants, claim expiry,
fencing and persisted Market receipts remain authoritative. User text cannot select a tool,
URL, SQL or operation. The worker/AI/API durable path computes the result through the real
Market facade, never an extraction shortcut or a fabricated terminal.

## Options considered

- Model extraction violates the deterministic-number requirement and creates unnecessary privacy
  and provider dependencies.
- Temporary inputs followed by graph extraction make persisted authority and receipts untruthful.
- A new pre-extraction queued lifecycle is possible but adds states and grants this story does
  not require; admission extraction establishes authoritative inputs before the existing flow.
- Reusing the structured basis for text hides provenance and makes future routing ambiguous.
- General tool selection from text weakens the existing closed capability boundary.

### Amendment: BRL separators do not depend on the interface language

`R$ 785.000` asked through the English interface was read as 785 reais, and `BRL 785,000` through
the Portuguese one likewise, because the price token was validated only against the locale's
convention. A BRL amount has at most two decimals, so a price without a scale word is now read by
its own separators in both locales: with both present the last is the decimal mark; a repeated
separator, or a single one between a one-to-three-digit head and exactly three digits, groups
thousands; any other single separator is the decimal mark. Areas and prices followed by a scale
word keep the locale convention, where three decimals are meaningful. This corrects grammar v1
rather than adding a version: retained runs keep the inputs persisted at their admission and are
not re-extracted.

## Consequences and verification

The parser has a documented bounded grammar, not unrestricted linguistic understanding. New
grammar versions require explicit provenance changes rather than reinterpretation of retained
requests. Jev routing and the 0.85 gate remain mandatory for the later general Ask surface.
The tracer performs no model decision or explanation, and claims neither full checkpoints,
queue/quota policy, UI completion nor production deployment.

Verify table-driven adversarial extraction, strict public/internal contracts, Market facade and
Ask admission with in-memory ports, additive upgrade preserving structured evidence, real
text-only PT/EN API-to-worker-to-graph-to-tool-to-SSE journeys, refusal with zero persisted
effects, fingerprint conflicts and forged tool requests. Use TypeScript/Vitest with real owned
Compose services under ADR 0020, unchanged coverage floors and normal hooks. D-012 keeps the
repository's explicit SQL, public facade, application-port and pnpm/Vitest conventions above
the Nest skill's alternative stack examples. No `.env*`, provider, real source or VPS action
is involved.
