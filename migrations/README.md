# Migrations

Migrations são arquivos SQL versionados, aplicados em ordem lexicográfica por
`scripts/migrate.sh`. A decisão de usar SQL explícito, sem ORM, está registrada em
[`../specs/adrs/0003-persistence-driver-and-migrations.md`](../specs/adrs/0003-persistence-driver-and-migrations.md).

## Convenção de nome

```text
NNNN_descricao_em_snake_case.sql
```

`NNNN` é um contador sequencial de quatro dígitos, nunca reaproveitado.

## Regras

- Datas e timestamps são armazenados em UTC (`timestamptz`).
- Identificadores externos (fonte + id na fonte) recebem constraint de unicidade, para que a
  ingestão seja idempotente.
- As extensões `postgis` e `vector` estão disponíveis na imagem do Compose, mas **não** são
  habilitadas: a migration que precisar de uma delas executa o `CREATE EXTENSION` correspondente e
  justifica a necessidade.
- Nenhuma migration de negócio existe ainda: o repositório está na fase de fundação.
