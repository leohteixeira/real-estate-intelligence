# @rei/application

Use cases and **ports**. Depends on `@rei/domain` only.

Ports are interfaces declared here and implemented by adapters in `@rei/infrastructure`. The
dependency direction is always inwards:
`@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.
