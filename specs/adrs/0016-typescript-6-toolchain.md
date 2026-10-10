# ADR 0016 — TypeScript 6 toolchain

- **Status:** accepted
- **Date:** 2026-10-10
- **Supersedes:** ADR 0006

## Context

ADR 0006 pinned TypeScript 5.9.3 because that was the newest compiler supported by the repository's
then-current NestJS and ESLint toolchain. The migration from NestJS 11 and Mastra to NestJS 12 and
LangGraph changes that compatibility set. Keeping different compilers in the applications would
make editor, type-check and build results depend on which workspace invoked them.

The frontend and repository-tooling choices in ADR 0006 remain valid; only its compiler constraint
needs to change. Because accepted records are immutable, this record restates those choices while
superseding ADR 0006.

## Decision

- Pin TypeScript **6.0.3** in the root and every application and package workspace.
- Retain React 19.2.8, Vite 8.2.2, `@vitejs/plugin-react` 6.1.0 and Vitest 4.1.11.
- Retain ESLint 10.8.1 with `typescript-eslint` 8.67.0 in one root flat configuration.
- Retain Prettier 3.8.1 and markdownlint-cli2 0.22.1.
- Add no Tailwind, router or data-fetching library in this phase.
- Keep development servers bound to `0.0.0.0` for Dev Container port forwarding.

## Consequences

All eight workspaces use one compiler version supported by the NestJS 12 migration and the current
lint toolchain. CommonJS Nest applications acknowledge TypeScript 6's deprecation warning for the
intentional Node 10 module-resolution mode while the repository keeps its existing emitted module
format.

The repository gives up the TypeScript 5.9 pin from ADR 0006 but preserves every other frontend and
tooling choice from that record.

## Reassessment trigger

Reassess the compiler pin when a supported toolchain migration makes TypeScript 7 appropriate, or
when the Nest applications intentionally change module format and resolution together.
