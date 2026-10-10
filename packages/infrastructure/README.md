# @rei/infrastructure

Adapters: PostgreSQL, object storage, listing sources, geocoding and model providers.

Vendor SDKs are allowed **only** here. No vendor type is re-exported to `@rei/application` or
`@rei/domain`.

One folder per bounded context holds its SQL repositories (`listing.pg-repository.ts`) and its
adapters (`s3-raw-snapshot-store.adapter.ts`); `shared/` holds only context-neutral plumbing. Its
`persistence/` folder currently owns the PostgreSQL connection, availability adapter and error
redaction. A repository reads and writes only the schema of its own context. An adapter makes one
attempt, maps vendor failures to the closed set of its port and leaves every repetition to the
policy that wraps it.

Connection errors go through `redactConnectionError` before being logged: the `pg` driver includes
the connection string in some failures, and it carries credentials.
