# ADR 0002 — Framework HTTP, workers e a fronteira do Mastra

- **Status:** aceito
- **Data:** 2026-08-20

## Contexto

O CLAUDE.md do workspace fixa Node.js 24, NestJS 11 para API e worker, e um runtime Mastra
separado. Também determina que o Mastra alcance capacidades de domínio apenas por tools tipadas ou
application services, e que nunca receba acesso irrestrito ao banco ou à infraestrutura.

## Decisão

- A API é uma aplicação **NestJS 11.2.1** com `@nestjs/platform-express`, prefixo global
  `api/v1` e `enableShutdownHooks()`. `/health` e `/ready` ficam fora do prefixo porque são
  operacionais, não parte do contrato de produto.
- O worker é um **application context standalone do Nest** (`NestFactory.createApplicationContext`):
  sem servidor HTTP, mas com os mesmos módulos, providers e ciclo de vida da API.
- O Mastra roda em `apps/ai`, como aplicação separada na porta 4111. Ele **não** depende de
  `@rei/infrastructure`, não lê `DATABASE_URL` e não instancia pool de conexão — nem no código, nem
  no `compose.yaml`.
- Os packages compartilhados são `@rei/domain`, `@rei/application`, `@rei/contracts` e
  `@rei/infrastructure`, ligados por TypeScript project references. A dependência é sempre para
  dentro: `@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.
- Nenhum tipo de driver cruza a fronteira: `@rei/infrastructure` expõe a classe opaca
  `DatabaseConnection` em vez do `Pool` do `pg`.
- **Sem fila nesta fase.** BullMQ e Valkey ficam para quando existir um job assíncrono real; o
  serviço `valkey` está declarado no Compose sob o profile `optional` e não é consumido.

### `mastra build` e a regra do npm

O CLAUDE.md proíbe `npm` nestes repositórios. O comando `mastra build` invoca `npm` internamente
para gerar o `package-lock.json` do bundle de deploy. Por isso o script `build` de `@rei/ai` é
apenas verificação de tipos, e a geração do bundle fica no script separado `bundle`, usado somente
pelo `docker/ai.Dockerfile`. Assim `pnpm -r build` e a CI permanecem livres de `npm`.

## Consequências

Duas maneiras diferentes de compilar convivem no repositório: `nest build` para a API e
`tsc --build` para o worker e para os packages. Em troca, cada aplicação usa a ferramenta que seu
framework espera.

A ausência de fila significa que o worker hoje é um laço com `setInterval`. Quando houver crawling
de verdade, isso não basta.

## Gatilho de reavaliação

Adotar BullMQ sobre Valkey quando existir o primeiro job que precise de retry com backoff,
dead-letter ou distribuição entre múltiplos workers.
