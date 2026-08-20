# @rei/infrastructure

Adapters: PostgreSQL, object storage, listing sources, geocoding and model providers.

Vendor SDKs are allowed **only** here. No vendor type is re-exported to `@rei/application` or
`@rei/domain`.

Connection errors go through `redactConnectionError` before being logged: the `pg` driver includes
the connection string in some failures, and it carries credentials.
