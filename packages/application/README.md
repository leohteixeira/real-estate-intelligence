# @rei/application

Casos de uso e **portas**. Depende apenas de `@rei/domain`.

Portas são interfaces declaradas aqui e implementadas por adapters em `@rei/infrastructure`. A
direção da dependência é sempre para dentro:
`@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.
