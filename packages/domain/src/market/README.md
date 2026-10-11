# market

Core context: deterministic place figures and their movement. Currently holds the price per square
meter rule, deterministic price-input extraction and listing-price facts. See ADR 0011 and
[ADR 0024](../../../../specs/adrs/0024-deterministic-text-price-admission.md).

`extractPriceInputs` is a pure bounded PT/EN grammar returning only canonical BRL minor units and
square metres or a finite refusal. Explicit labels/currency/units associate whole numeric tokens;
unrelated digits never become fallback candidates. Locale grouping and BigInt money scales are
validated before safe conversion; competing candidates, ranges and malformed tokens are refused.
Application Market validation reuses the canonical price-per-square-metre rule to reject unsafe
rounded results before Ask admission. There is no model, provider, infrastructure or clock access.
