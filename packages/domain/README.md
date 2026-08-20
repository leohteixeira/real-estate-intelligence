# @rei/domain

Canonical model and business rules. This package does **not** depend on infrastructure, on a vendor
SDK or on a data source.

One folder per module, following section 3.3 of the product specification. The folders are empty on
purpose: the foundation phase does not create entities yet.

Rules that belong here once implementation starts:

- `Property` and `Listing` are distinct entities; one property may have several listings over time,
  from different sources.
- History is first-class: `ListingSnapshot` and `ListingEvent` preserve the evolution, not just the
  current state.
- Entity resolution is explainable: the criteria that merged two listings are recorded.
- Asking price and transaction price are never conflated.
- Calculations such as price per square meter are deterministic. An LLM may explain the result,
  never produce it — see `src/market/price-per-square-meter.ts`.
