---
title: 'Conventions of the versioned contract'
type: 'feature'
ticket: '7'
created: '2026-10-10'
status: 'done'
baseline_revision: '6268fe67dd2d273c1a828da59571c9ebaaf9f9e6'
route: 'full'
route_source: 'pinned'
risk: 'low'
review: 'quick'
review_source: 'pinned'
lenses_ran:
  - 'quick'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - 'AGENTS.md'
  - '_bmad-output/initiative-real-estate-intelligence/spec-real-estate-intelligence/architecture.md'
warnings:
  - 'multiple-goals'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Consumers lack one stable JSON convention for errors, pagination, monetary values, and
provenance, and most bounded contexts have no contracts barrel. The API also returns Nest's default
unknown-route body without a request identifier, which prevents reliable support correlation.

**Approach:** Add framework-free shared response types and one public barrel for each bounded
context, then compose server-generated request identifiers and a global exception filter through a
single API setup function used by production and HTTP tests. Preserve the existing operational
health bodies while applying the request identifier response header to them.

## Boundaries & Constraints

**Always:** Use JSON-safe readonly contracts; represent BRL in safe-integer centavos; use opaque
cursor pagination with a total item count; preserve provenance value, source, absolute source URL,
and RFC 3339 collection time; generate request identifiers on the server; return the same identifier
in the error body and `X-Request-Id` header; export exactly the nine documented context barrels.

**Never:** Import Nest, Express, provider SDK, or domain classes into `@rei/contracts`; trust a
client-supplied request identifier; expose exception messages, stack traces, request paths, or raw
payloads; change `/health` or `/ready` response bodies; add validation libraries, persistence, VPS
access, provider connections, or context business behavior.

## I/O & Edge-Case Matrix

<!-- markdownlint-disable MD013 -->

| Scenario                   | Input / State                             | Expected Output / Behavior                                                 | Error Handling                                        |
| -------------------------- | ----------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------- |
| Missing versioned route    | `GET /api/v1/does-not-exist`              | 404 error envelope; body and header contain the same UUID                  | Stable public `not_found` code and safe message       |
| Unexpected failure         | Non-HTTP exception reaches the filter     | 500 error envelope with a fresh request identifier                         | Public `internal_error`; internals are not serialized |
| Client correlation attempt | Request includes `X-Request-Id`           | API replaces it with a server-generated UUID                               | Untrusted input is never reflected                    |
| Paginated result           | Empty, intermediate, or final cursor page | Readonly items, non-negative `totalItems`, nullable opaque `nextCursor`    | Consumers derive completion from a null cursor        |
| Money and provenance       | BRL value and JSON-safe sourced value     | Centavos/currency and complete evidence serialize without domain instances | Types exclude non-JSON values and other currencies    |
| Operational health         | `/health` and `/ready` success bodies     | Existing bodies remain unchanged; response header carries request ID       | Existing readiness 503 body remains operational       |

<!-- markdownlint-enable MD013 -->

</intent-contract>

## Code Map

- `packages/contracts/src/shared/` -- shared JSON types for errors, cursor pages, BRL money,
  provenance, health, and API versioning.
- `packages/contracts/src/<context>/index.ts` and `packages/contracts/src/index.ts` -- public
  barrels for properties, market, comparables, collection, locations, ask, alerts, audit, and
  identity.
- `apps/api/src/http/` -- request identifier middleware/helpers and a catch-all HTTP exception
  filter, isolated from all bounded contexts.
- `apps/api/src/configure-api.ts` and `apps/api/src/main.ts` -- one composition function for global
  prefix, middleware, filter, and production bootstrap.
- `packages/contracts/src/shared/index.test.ts` and `apps/api/src/configure-api.test.ts` --
  executable fixtures for exports, JSON shapes, error safety, request IDs, versioned routing, and
  unchanged operational health contracts.

## Tasks & Acceptance

**Execution:**

- [x] `packages/contracts/src/shared/` and its tests -- define and exercise the four JSON
      conventions while retaining the health/version exports.
- [x] `packages/contracts/src/<context>/index.ts` and `packages/contracts/src/index.ts` -- expose
      exactly the nine bounded-context surfaces without cross-context implementation dependencies.
- [x] `apps/api/src/http/` and `apps/api/src/configure-api.ts` -- issue server-controlled request IDs
      and normalize every thrown HTTP error through the public envelope.
- [x] `apps/api/src/configure-api.test.ts` and `apps/api/src/health/health.controller.test.ts` -- run
      the real Nest/Express request path for errors, spoofed IDs, prefixing, and operational health.

**Acceptance Criteria:**

- Given a consumer importing `@rei/contracts`, when it uses common response types or any documented
  context surface, then type checking and contract tests pass without framework or domain imports.
- Given an unknown versioned route, when the configured API handles it, then it returns 404 with the
  stable error envelope and matching server-generated request identifier in body and header.
- Given the existing health and readiness routes, when the same global setup handles them, then they
  remain outside `/api/v1`, retain their current response bodies, and include the correlation
  header.
- Given an unexpected exception, when the global filter serializes it, then the response is a safe
  500 envelope and contains no internal message, path, stack, or client-provided identifier.

## Implementation Notes

- Added readonly error, cursor page, BRL money, provenance, and recursive JSON-compatible contract
  types without importing framework, domain, or provider types.
- Added the missing context barrels and kept all context exports available through the contracts
  package root.
- Centralized the API's global prefix, server-generated request identifier middleware, and safe
  exception filter in `configureApi`, shared by production bootstrap and HTTP lifecycle tests.
- Logged unexpected failures as a sanitized structured event containing only the request identifier;
  exception text, stack, path, request data, and payload remain absent.
- Preserved safe status mappings for structurally recognized Express/body-parser HTTP errors, and
  log every normalized 5xx response without including exception details.
- Replaced the inbound request header itself with the server UUID so downstream middleware and
  controllers cannot observe a spoofed client correlation value.
- Added runtime matrix coverage and declaration-level regressions proving that ordinary contract
  interfaces compose while non-JSON page items become unassignable.

## Plan Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 3 findings — high 0, medium 3, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Pagination admitted non-JSON item types — verified that
    `PaginatedResponse<bigint>` previously exposed `bigint` items and could fail at serialization;
    items now use the recursive `JsonCompatible<T>` shape, with a declaration-level regression that
    makes the invalid item type `never`.
  - `[medium]` `[patch]` Provenance rejected ordinary JSON-safe contract interfaces — verified that
    `AuditTraceAcceptedResponse` did not satisfy the former string-index constraint; provenance now
    maps its value through `JsonCompatible<T>`, and both compile-time and runtime tests compose the
    existing audit response unchanged.
  - `[medium]` `[patch]` Unexpected exceptions became silent 500 responses — verified that the
    catch-all filter bypassed Nest's default unknown-error logger; it now emits only the sanitized
    `api.unexpected_failure` event and server-generated request ID, covered by a logger spy that also
    rejects the fixture's sensitive message and path.

### 2026-10-10 — Follow-up review pass

- verdicts: 4 findings — high 0, medium 3, low 0, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Express/body-parser HTTP errors lost their public status mapping —
    reproduced an oversized JSON request returning 500 instead of 413; the filter now recognizes a
    conservative structural HTTP-error shape and the configured application returns the stable
    `payload_too_large` envelope.
  - `[medium]` `[patch]` Downstream consumers could still read a spoofed request header — verified
    that only the private request slot and response header were replaced; the middleware now also
    overwrites the normalized inbound header, and a controller-level test proves one server UUID is
    visible throughout the request lifecycle.
  - `[false]` `[reject]` Optional properties could explicitly receive `undefined` — the contract
    promises JSON-safe wire serialization, not identity-preserving round trips for omitted optional
    fields. JavaScript's standard optional-property semantics serialize that value as absence;
    prohibiting it would require a repository-wide `exactOptionalPropertyTypes` policy or
    disproportionate type machinery outside this story.
  - `[medium]` `[patch]` Nest 5xx exceptions were redacted but not logged — reproduced a silent
    `InternalServerErrorException`; every normalized 5xx now emits only the sanitized event and
    request ID, with a focused regression proving the private message is absent.
- convergence: the first and fourth findings share the exception-normalization root cause; the
  request-header issue is independent. All confirmed findings were patched and the full gate suite
  passed, so no additional follow-up review is recommended.

## Design Notes

The public wire shapes are deliberately structural: `MoneyResponse` uses `minorUnits` plus the
literal `BRL`; `ProvenanceResponse<T>` maps its value through `JsonCompatible<T>` and mirrors the
domain evidence using strings; and `PaginatedResponse<T>` maps its items through the same JSON-safe
shape while carrying `{ nextCursor, totalItems }`. A nullable opaque cursor avoids offset drift
while `totalItems` supports the product's explicit result count.

The error envelope is `{ error: { code, message, requestId } }`. Status-derived client errors use
stable public codes and messages, while unexpected failures collapse to `internal_error`. Request
IDs are UUIDs generated at the HTTP boundary for every request, not distributed-trace identifiers;
Story 1.8 may correlate them without changing this public contract.

## Verification

**Commands:**

- `pnpm run lint` -- source, boundary, migration, and Markdown conventions pass.
- `pnpm run typecheck` -- every workspace accepts the new public surfaces and API setup.
- `pnpm run test` -- contract fixtures and real in-memory HTTP lifecycle tests pass.
- `pnpm run test:coverage` -- configured coverage thresholds remain satisfied.
- `pnpm run build` -- all applications and packages compile for production.
- `git diff --check` -- no whitespace errors are introduced.

## Auto Run Result

### Summary

Implemented the versioned HTTP contract conventions for errors, cursor pagination, BRL money, and
provenance; completed the nine context barrels; and applied server-controlled request correlation
and safe error serialization to the real Nest request lifecycle without changing operational
health bodies.

### Files Changed

- `packages/contracts/src/shared/` -- defines the common JSON-safe shapes, exports them through the
  shared barrel, and verifies runtime serialization plus compile-time composition.
- `packages/contracts/src/{properties,market,comparables,collection,locations,ask,alerts,audit,identity}/`
  and `packages/contracts/src/index.ts` -- provide the nine bounded-context contract barrels and the
  package-root surface.
- `apps/api/src/http/` -- generates server-owned UUID request identifiers and normalizes exceptions
  into the stable public error envelope with sanitized failure logging.
- `apps/api/src/configure-api.ts` and `apps/api/src/main.ts` -- share one HTTP composition path
  between production and tests.
- API controller/configuration tests -- verify versioning, unknown routes, spoofed identifiers,
  redacted 500s, audit routing, and unchanged health/readiness bodies.
- This plan -- records the contract decision, implementation evidence, review triage, and gates.

### Review Findings

- Patches applied: 6 medium findings across both review passes. The corrections constrain generic
  values to recursively JSON-compatible shapes, allow ordinary contract interfaces to compose,
  preserve framework HTTP statuses, normalize the inbound request header, and provide sanitized
  observability for every 5xx response.
- Items deferred: 0.
- Findings rejected: 1. Explicit `undefined` on an optional property follows standard omission
  semantics and does not violate JSON-safe wire serialization.
- Follow-up review recommendation: false. The independent follow-up review converged after all
  three confirmed findings were patched and reverified.

### Verification Performed

- `pnpm run lint` -- passed, including context-boundary and migration-convention checks.
- `pnpm run typecheck` -- passed across all eight checked workspace projects and the declaration
  regressions.
- `pnpm run test` -- passed: 289 tests across 45 files, including all matrix scenarios and the real
  oversized-body request path.
- `pnpm run test:coverage` -- passed every configured threshold; API reached 92.64% statements and
  lines, 86.44% branches, and 100% functions after the structural error guards were added.
- `pnpm run build` -- passed for all eight checked workspace projects; Vite emitted only its existing
  chunk-size advisory.
- `git diff --check` -- passed after the review patches.

### Residual Risks

No known functional defect remains in the story scope. Vite continues to emit its pre-existing
chunk-size advisory for the web build; it is unrelated to this HTTP-contract story.
