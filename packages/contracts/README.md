# @rei/contracts

Types of the versioned HTTP contract, shared between the API and its consumers.

Shapes are grouped by bounded context (ADR 0011). Context-neutral operational health shapes and
the version constant of the prefix (`api/v1`) live under `shared/`. This package holds no business
rule, orchestration or data access.
