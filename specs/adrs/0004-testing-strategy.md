# ADR 0004 — Estratégia de testes

- **Status:** aceito
- **Data:** 2026-08-20

## Contexto

O CLAUDE.md exige que este repositório verifique unidade, integração, end-to-end e build por
scripts pnpm próprios. A especificação exige estratégia de avaliação para funcionalidades
probabilísticas.

## Decisão

- **Vitest 4.1.11** como único runner, em todos os packages e aplicações. Jest, que é o padrão do
  NestJS, foi descartado para não manter dois runners no mesmo repositório.
- Sem biblioteca de asserção extra e sem framework de mock: `expect` do Vitest e dublês escritos à
  mão como implementações das portas de `@rei/application`.
- Os scripts de teste usam `vitest run --dir src` para varrer apenas o código-fonte. Sem isso, o
  Vitest coleta os testes compilados em `dist/` e falha ao tentar carregá-los como CommonJS.
- `apps/api/tsconfig.build.json` exclui `src/**/*.test.ts` do `nest build`, para que arquivos de
  teste não cheguem ao artefato.
- Testes end-to-end com Playwright e testes de integração contra PostgreSQL real ficam para quando
  existir a primeira funcionalidade de negócio. A imagem do Dev Container já traz as dependências
  de sistema do Playwright.
- Datasets de avaliação para IA entram junto com o primeiro agente ou tool.

## Consequências

`pnpm test` cobre hoje apenas regras determinísticas e leitura de configuração. Não há cobertura de
integração nem end-to-end, o que é adequado à fase de fundação mas precisa mudar antes da primeira
funcionalidade que toque o banco.

## Gatilho de reavaliação

Adicionar Playwright quando existir a primeira tela com fluxo real. Adicionar Testcontainers ou
usar o PostgreSQL do Compose quando existir o primeiro repositório concreto.
