# ask

Supporting context: threads, natural-language runs, run events, checkpoints and the demo quota. See
ADR 0011 and D-043 in the Ask epic.

This slice defines framework-free immutable prepared-example views and pure scripted-preview
invariants. It does not implement execution, checkpoints, durable events or quota enforcement.
Price-per-square-metre examples reuse the existing deterministic shared calculation. The fixture
port and query facade live in application; the provider-free synthetic adapter lives in
infrastructure. Public closed wire parsers remain independent in contracts.
