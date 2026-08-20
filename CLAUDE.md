# Real Estate Intelligence — instruções para agentes

Extensão específica deste repositório. Leia primeiro `/workspace/CLAUDE.md`; o que estiver aqui
prevalece apenas dentro de `repos/real-estate-intelligence`.

## Estado

Fundação. Existem os quatro apps, os quatro packages, configuração, telemetria, conexão de banco,
endpoints de health e uma regra de domínio determinística (`pricePerSquareMeter`). Não existem
entidades, collectors, comparables, tools do Mastra nem endpoints de negócio.

## Regras de arquitetura

- Dependência sempre para dentro: `@rei/api` / `@rei/worker` → `@rei/application` → `@rei/domain`.
- `@rei/domain` não depende de nada. `@rei/application` depende apenas de `@rei/domain`.
- SDKs de fornecedor vivem **apenas** em `@rei/infrastructure`. Nenhum tipo de vendor é
  reexportado: as aplicações recebem `DatabaseConnection`, nunca o `Pool` do `pg`.
- `@rei/ai` **nunca** recebe `DATABASE_URL`, credencial de object storage ou dependência de
  `@rei/infrastructure`. Ele alcança o domínio só por tools tipadas que chamam `/api/v1` ou por
  application services explicitamente expostos.
- `Property` e `Listing` são entidades diferentes. Histórico é first-class. Entity resolution é
  explicável. Asking price nunca é confundido com transaction price.
- Cálculos de mercado, filtros geoespaciais e comparables são determinísticos e ficam no backend.
  Uma LLM pode interpretar ou explicar o resultado, nunca produzi-lo.
- Collectors respeitam ToS, robots, rate limits e licenciamento das fontes. Em desenvolvimento, use
  datasets sintéticos ou fontes explicitamente permitidas.

## Convenções

- SQL explícito via `pg`. Sem ORM.
- Migrations são SQL versionado em `migrations/`, aplicadas por `scripts/migrate.sh`. `postgis` e
  `vector` estão disponíveis na imagem, mas nenhuma extensão é habilitada por padrão.
- Uma única configuração de ESLint na raiz cobre todos os workspaces. Não crie `eslint.config.js`
  por package.
- Testes com Vitest, sempre `--dir src`: sem isso o runner coleta os testes compilados em `dist/`.
- A API e o worker sobem com `node -r ./dist/otel.js dist/main.js`. Não remova o preload.
- Nunca registre em log connection string, credencial de fonte ou chave de provider.
- `npm` é proibido. O `mastra build` invoca `npm` internamente, por isso ele fica no script
  separado `bundle`, usado apenas pelo Dockerfile, e nunca em `pnpm -r build`.

## Comandos

```bash
pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build
lefthook run pre-commit --all-files
```

Rode Git sempre a partir deste diretório, nunca de `/workspace`. Não faça commit automaticamente.
