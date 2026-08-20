# @rei/ai

Runtime do Mastra, executado como aplicação separada na porta 4111.

## Regra de fronteira

Esta aplicação **nunca** recebe acesso irrestrito ao banco ou à infraestrutura. Ela alcança as
capacidades de domínio apenas através de:

- tools tipadas que chamam o contrato HTTP versionado da API (`/api/v1`); ou
- application services explicitamente expostos a ela.

Concretamente, isso significa que `@rei/ai` **não** declara dependência de `@rei/infrastructure`,
não lê `DATABASE_URL` e não instancia um pool de conexões.

Exemplos de tools previstas pela especificação de produto:

```text
findComparableProperties()
getPropertyHistory()
getRegionStatistics()
searchListings()
```

## Estado

Nenhum agente e nenhuma tool registrados. Eles entram junto com os application services que cada um
tem permissão de chamar.

## Comandos

```bash
pnpm --filter "@rei/ai" dev      # http://0.0.0.0:4111
pnpm --filter "@rei/ai" build    # type check
pnpm --filter "@rei/ai" bundle   # gera .mastra/output para deploy
```

`build` é apenas verificação de tipos. O bundle de deploy fica no script separado `bundle` porque
o `mastra build` invoca `npm` internamente para gerar o `package-lock.json` do diretório de saída,
e o CLAUDE.md do workspace proíbe `npm` no fluxo padrão. Enquanto não houver agente nem tool
registrados, o bundle não agrega nada ao `pnpm -r build`. A saída fica em `.mastra/`, que é
ignorada pelo Git.
