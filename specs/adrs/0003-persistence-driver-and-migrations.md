# ADR 0003 — Driver PostgreSQL, ORM e migrations

- **Status:** aceito
- **Data:** 2026-08-20

## Contexto

PostgreSQL é o banco primário. A especificação prevê PostGIS para consultas geoespaciais e
`pgvector` para busca semântica, ambos como recursos futuros (V2), e exige cálculos determinísticos
para preço/m², comparables e métricas de mercado.

## Decisão

- Acesso a dados via **driver `pg` (node-postgres) 8.23.0**, encapsulado na classe
  `DatabaseConnection` de `@rei/infrastructure`. **Sem ORM**: nem Prisma, nem TypeORM, nem Drizzle,
  nem Kysely.
- Nenhum tipo do `pg` é reexportado. As aplicações recebem `DatabaseConnection`, não `Pool`.
- Migrations são **arquivos SQL versionados** em `migrations/`, aplicados em ordem lexicográfica
  por `scripts/migrate.sh`, que controla o que já rodou na tabela `schema_migrations`.
- A imagem do Compose é `postgis/postgis:18-3.6-alpine`, que traz PostGIS disponível, mas
  **nenhuma extensão é habilitada**: a migration que precisar de `postgis` ou `vector` executa o
  `CREATE EXTENSION` correspondente e justifica a necessidade.
- Erros de conexão passam por `redactConnectionError` antes de virarem log.
- Timestamps em UTC (`timestamptz`); o par (fonte, identificador na fonte) recebe constraint de
  unicidade, para que a ingestão seja idempotente.

O ORM foi descartado principalmente pelo domínio: consultas geoespaciais, comparables e séries
temporais de preço são exatamente o tipo de SQL que ORMs escondem atrás de abstrações difíceis de
auditar. A especificação exige que esses cálculos sejam explicáveis.

## Consequências

Mapeamento de linha para objeto escrito à mão, com mais código por consulta e sem migrations
geradas automaticamente a partir de um schema declarativo. Em troca, o SQL que produz um preço
médio por bairro fica visível e revisável.

## Gatilho de reavaliação

Adotar um query builder tipado, como Kysely, quando o mapeamento manual passar de algo em torno de
30 consultas ou começar a produzir defeitos recorrentes. Reavaliar Prisma apenas se ele passar a
suportar PostGIS de forma nativa.
