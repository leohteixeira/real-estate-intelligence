#!/usr/bin/env bash

set -Eeuo pipefail

# Coverage is evaluated independently in every workspace. These exclusions are
# limited to declarations, composition roots, and the visual-only portfolio
# shell whose behavior is exercised by browser journeys. See docs/testing/coverage.md.
coverage_args=(
  --coverage
  --coverage.provider=v8
  --coverage.reporter=text
  "--coverage.include=src/**/*.{ts,tsx}"
  "--coverage.exclude=src/**/*.test.{ts,tsx}"
  "--coverage.exclude=src/**/*.d.ts"
  "--coverage.exclude=src/**/index.ts"
  "--coverage.exclude=src/main.ts"
  "--coverage.exclude=src/main.tsx"
  "--coverage.exclude=src/otel.ts"
  "--coverage.exclude=src/**/*.module.ts"
  "--coverage.exclude=src/App.tsx"
  "--coverage.exclude=src/landing/CityScene.ts"
  "--coverage.exclude=src/landing/LandingPage.tsx"
  "--coverage.exclude=src/landing/copy.ts"
  --coverage.thresholds.lines=80
  --coverage.thresholds.statements=80
  --coverage.thresholds.functions=80
  --coverage.thresholds.branches=75
)

pnpm -r --workspace-concurrency=1 exec vitest run --dir src --passWithNoTests "${coverage_args[@]}"
