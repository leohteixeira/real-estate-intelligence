# @rei/contracts

Types of the versioned HTTP contract, shared between the API and its consumers.

Shapes are grouped by bounded context (ADR 0011). This package holds no business rule and no data
access: only the shapes that cross the HTTP boundary, plus the version constant of the prefix
(`api/v1`).
