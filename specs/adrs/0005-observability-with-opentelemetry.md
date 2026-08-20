# ADR 0005 — Observabilidade com OpenTelemetry

- **Status:** aceito
- **Data:** 2026-08-20

## Contexto

A especificação exige instrumentação com OpenTelemetry de requests, jobs, collectors, duração de
crawling, erros de parsing, chamadas de LLM, tool calls, consumo de tokens e falhas de enrichment.
O CLAUDE.md exige logs, métricas e traces correlacionáveis, sem registrar segredos.

## Decisão

- `@opentelemetry/sdk-node` 0.221.0 com um conjunto **explícito** de instrumentações, em vez de
  `@opentelemetry/auto-instrumentations-node`: `instrumentation-http` e `instrumentation-pg` nos
  dois processos, mais `instrumentation-express` apenas na API. O pacote automático traz dezenas de
  instrumentações que este projeto não usa.
- O bootstrap fica em `src/otel.ts` de cada aplicação e é **pré-carregado** pelo script de start
  (`node -r ./dist/otel.js dist/main.js`). Isso não é detalhe de estilo: chamar o SDK de dentro do
  `main.ts` seria tarde demais, porque `http`, `express` e `pg` já teriam sido carregados e não
  poderiam mais ser instrumentados.
- Exportação OTLP ativada **somente** quando `OTEL_EXPORTER_OTLP_ENDPOINT` está definido, para que
  o processo funcione sem um collector local.
- `OTEL_SERVICE_NAME` identifica cada processo; o valor padrão é o nome da aplicação.
- Logging com o **Logger nativo do NestJS**. Sem pino e sem winston: o logger da plataforma atende
  e evita mais uma dependência.
- Connection strings, credenciais de fonte e chaves de provider nunca entram em log, span ou
  métrica. `@rei/infrastructure` redige credenciais antes de propagar qualquer erro do driver.

O runtime do Mastra ainda não é instrumentado, porque não há agente nem tool registrados.

## Consequências

O script de start passa a depender do preload; rodar `node dist/main.js` diretamente sobe o
processo sem telemetria. Isso está documentado no README e é o que o `compose.yaml` executa.

A correlação entre log e trace ainda não é automática: quando existirem handlers de negócio, o
`trace_id` precisará ser injetado no contexto do logger.

## Gatilho de reavaliação

Instrumentar o Mastra junto com o primeiro agente ou tool, cobrindo chamadas de modelo, tool calls
e consumo de tokens. Adicionar injeção de `trace_id` no logger junto com o primeiro endpoint de
negócio.
