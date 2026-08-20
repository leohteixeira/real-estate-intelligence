# Real Estate Intelligence

Plataforma de coleta, normalização, acompanhamento e análise de dados públicos de imóveis. O
objetivo não é um agregador de anúncios, e sim uma camada de inteligência de mercado que responde
perguntas sobre preço por metro quadrado, valorização por região, quedas recentes de preço,
anúncios parados e imóveis subvalorizados.

A especificação de produto vive em `/workspace/docs/real_state_intelligence.md`.

> Estado atual: **fundação**. A estrutura, o ferramental e os processos estão prontos; não existem
> entidades, collectors, comparables nem endpoints de negócio.

## Stack

| Camada       | Escolha                                                    |
| ------------ | ---------------------------------------------------------- |
| API          | NestJS 11 sobre Express (porta 8200)                       |
| Worker       | application context standalone do Nest                     |
| IA           | Mastra 1.25 em aplicação separada (porta 4111), sem tools  |
| Persistência | PostgreSQL 18 com PostGIS disponível, driver `pg`, sem ORM |
| Migrations   | SQL versionado aplicado por `scripts/migrate.sh`           |
| Web          | React 19 + Vite 8 + TypeScript 5.9.3 (porta 3200)          |
| Telemetria   | OpenTelemetry Node 0.221, pré-carregado por `node -r`      |
| Testes       | Vitest 4                                                   |

As decisões estão registradas em [`specs/adrs/`](specs/adrs/).

## Layout

```text
apps/
├── web/       # frontend React
├── api/       # NestJS: HTTP e orquestração de aplicação
├── worker/    # crawling e jobs assíncronos
└── ai/        # runtime Mastra, isolado
packages/
├── domain/          # modelo canônico e regras determinísticas
├── application/     # casos de uso e portas
├── contracts/       # tipos do contrato HTTP versionado
└── infrastructure/  # adapters; SDKs de fornecedor só aqui
migrations/    # SQL versionado
specs/adrs/    # decisões de arquitetura
```

A direção da dependência é sempre para dentro:
`@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.

`@rei/ai` **não** depende de `@rei/infrastructure`, não recebe `DATABASE_URL` e não instancia pool
de conexão. Ele alcança o domínio apenas por tools tipadas que chamam `/api/v1`.

## Como começar

```bash
cp env.example .env          # ajuste se precisar
pnpm install --frozen-lockfile
pnpm run build               # os packages precisam existir antes de rodar os apps
lefthook install             # instala os git hooks
```

O arquivo de exemplo se chama `env.example`, sem ponto inicial, porque o `.claudeignore` da raiz do
workspace exclui todo caminho `.env.*`.

## Comandos

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build

pnpm --filter "@rei/api" dev      # http://0.0.0.0:8200
pnpm --filter "@rei/worker" dev
pnpm --filter "@rei/web" dev      # http://0.0.0.0:3200
pnpm --filter "@rei/ai" dev       # http://0.0.0.0:4111

docker compose up -d                       # postgres, api, worker, ai, web
docker compose --profile optional up -d    # + valkey e minio
DATABASE_URL=postgres://realestate:realestate@localhost:5434/real_estate_intelligence \
  ./scripts/migrate.sh
```

A API e o worker são iniciados com `node -r ./dist/otel.js dist/main.js`. O preload é obrigatório:
sem ele o processo sobe, mas sem instrumentação, porque `http`, `express` e `pg` já teriam sido
carregados quando o SDK tentasse instrumentá-los.

## Endpoints

| Método | Rota      | Descrição                                               |
| ------ | --------- | ------------------------------------------------------- |
| `GET`  | `/health` | Liveness. Não toca em dependência alguma.               |
| `GET`  | `/ready`  | Readiness. Responde 503 quando o PostgreSQL não atende. |
| —      | `/api/v1` | Superfície versionada do contrato, ainda vazia.         |

## Portas

Web 3200, API 8200, Mastra 4111, PostgreSQL 5434, Valkey 6380, MinIO 9100/9101.

## Qualidade

Os hooks do lefthook rodam gitleaks, prettier, markdownlint, hadolint e ESLint no `pre-commit`;
validam Conventional Commits no `commit-msg`; e rodam a varredura de histórico do gitleaks mais
lint, typecheck, testes e build no `pre-push`.

```bash
lefthook run pre-commit --all-files
gitleaks git --redact --no-banner
```

Commits seguem Conventional Commits em inglês. Especificações e documentação voltada ao usuário
podem ser escritas em português; código, identificadores e comentários permanecem em inglês.
