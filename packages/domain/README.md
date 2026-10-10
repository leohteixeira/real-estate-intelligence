# @rei/domain

Canonical model and business rules. This package does **not** depend on infrastructure, on a vendor
SDK or on a data source.

One folder per bounded context (ADR 0011): `properties`, `market`, `comparables`, `collection`,
`locations`, `ask`, `alerts`, `audit` and `identity`. Inside a context, one folder per aggregate
holds its entity, value objects, events and rules, told apart by suffix (`listing.entity.ts`,
`asking-price.vo.ts`, `listing.events.ts`); `shared/` holds only the context-neutral kernel:
immutable BRL money, provenance, UUIDv7 validation, serializable domain events and W3C trace
context. It contains no repository or business-context rule. A context exports only through its
`index.ts` and never imports the internals of another.

Rules that belong here once implementation starts:

- `Property` and `Listing` are distinct entities; one property may have several listings over time,
  from different sources.
- History is first-class: `ListingSnapshot` and `ListingEvent` preserve the evolution, not just the
  current state.
- Entity resolution is explainable: the criteria that merged two listings are recorded.
- Asking price and transaction price are never conflated.
- Calculations such as price per square meter are deterministic. An LLM may explain the result,
  never produce it — see `src/market/price-per-square-meter.ts`.
