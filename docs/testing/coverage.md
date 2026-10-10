# Test coverage policy

`pnpm run test:coverage` runs every workspace test suite with V8 coverage and evaluates each
workspace independently. The command fails when lines, statements, or functions fall below 80%, or
when branches fall below 75%. CI uses this command in place of an unmeasured unit-test run.
Every invocation is scoped with `--dir src`, so compiled tests under `dist` are never discovered.

The include rule counts every TypeScript and TSX source file, even when no test imports it. The
following exclusions keep generated or declarative wiring out of the denominator:

- test files and TypeScript declarations;
- barrel files, Nest modules, process entrypoints, and OpenTelemetry bootstrap files;
- `App.tsx`, `LandingPage.tsx`, `CityScene.ts`, and `copy.ts`, which form the static visual portfolio
  shell rather than product or business behavior.

The visual shell is verified through browser journeys and visual inspection. Deterministic landing
page behavior in `config.ts` and `cityLayout.ts` remains inside the unit-coverage gate. New
exclusions require an explicit justification here and must never conceal domain, application,
adapter, validation, resilience, persistence, or security behavior.

Thresholds may be raised directly as coverage improves. Lowering one requires an owner decision
that explains why the change does not weaken the quality gate.
