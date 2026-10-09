# ADR 0007 — NestJS and LangGraph runtime boundary

- **Status:** accepted
- **Date:** 2026-10-09
- **Supersedes:** ADR 0002

## Context

ADR 0002 selected NestJS 11 for the API and worker and Mastra for a separate AI runtime. The
foundation has no AI tool or business endpoint yet, so changing the orchestration framework now
avoids a later migration. The security boundary remains necessary regardless of framework.

## Decision

- API, worker and AI applications use **NestJS 12**.
- LangChain and LangGraph replace Mastra in `apps/ai`, which remains a separate process on port
  `4111`.
- `apps/ai` does not depend on `@rei/infrastructure`, receive `DATABASE_URL`, object-storage or
  broker credentials, or instantiate infrastructure clients outside its AI adapters.
- The AI application reaches domain capabilities only through typed HTTP tools or explicitly
  exposed application services. Deterministic calculations remain in the backend.
- AI provider SDKs are contained by adapters in `@rei/ai`. Their types do not cross application
  ports or enter domain and public contracts.
- The Mastra-only bundle script and its internal `npm` invocation are removed when the runtime is
  migrated. Repository installation and builds continue to use pnpm.

## Consequences

All Node.js applications share the NestJS lifecycle and dependency-injection model. LangGraph adds
explicit state, interruption and checkpoint seams, but the repository must own its integration
instead of relying on Mastra's runtime and build conventions.

The workspace and repository agent instructions still name NestJS 11 and Mastra. They must be
updated before the first implementation story so that operational instructions match this ADR.

## Reassessment trigger

Reassess LangGraph if it cannot support typed tools, human confirmation and externally owned
checkpoints without giving `apps/ai` direct infrastructure access.
