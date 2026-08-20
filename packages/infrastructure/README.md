# @rei/infrastructure

Adapters: PostgreSQL, object storage, fontes de anúncios, geocoding e model providers.

SDKs de fornecedor são permitidos **apenas** aqui. Nenhum tipo de vendor é reexportado para
`@rei/application` ou `@rei/domain`.

Erros de conexão passam por `redactConnectionError` antes de virarem log: o driver `pg` inclui a
connection string em algumas falhas, e ela carrega credenciais.
