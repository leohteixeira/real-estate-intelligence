# @rei/ai

Mastra runtime, executed as a separate application on port 4111.

## Boundary rule

This application **never** receives unrestricted access to the database or to infrastructure. It
reaches domain capabilities only through:

- typed tools that call the versioned HTTP contract of the API (`/api/v1`); or
- application services explicitly exposed to it.

Concretely, that means `@rei/ai` declares **no** dependency on `@rei/infrastructure`, does not read
`DATABASE_URL` and does not instantiate a connection pool.

Examples of tools foreseen by the product specification:

```text
findComparableProperties()
getPropertyHistory()
getRegionStatistics()
searchListings()
```

## State

No agent and no tool registered. They land together with the application services each one is
allowed to call.

## Commands

```bash
pnpm --filter "@rei/ai" dev      # http://0.0.0.0:4111
pnpm --filter "@rei/ai" build    # type check
pnpm --filter "@rei/ai" bundle   # produces .mastra/output for deployment
```

`build` is type checking only. The deployment bundle lives in the separate `bundle` script because
`mastra build` invokes `npm` internally to generate the `package-lock.json` of the output
directory, and the workspace CLAUDE.md forbids `npm` in the standard flow. As long as no agent and
no tool are registered, the bundle adds nothing to `pnpm -r build`. The output goes to `.mastra/`,
which is ignored by Git.
