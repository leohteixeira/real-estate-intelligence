# Market application facade

`MarketCalculationFacade` exposes deterministic `extractPriceInputs` and `pricePerSquareMeter`.
The extraction method delegates whole-token grammar to the Market domain and applies the same
numeric validation and canonical rounding used by the calculation method. Refusals are finite
values, including `unsafe_result`; unexpected errors are not converted into extraction refusals.
Extraction performs no I/O and has no clock dependency. Result timestamps belong only to actual
calculation calls.

Ask uses this public facade before preparing a thread or accepting a durable text run. Derived
inputs remain immutable evidence; AI and worker neither extract nor calculate. Read contracts,
listing-price fact projection and prepared Market examples remain independent of text admission.
