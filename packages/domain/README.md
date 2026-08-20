# @rei/domain

Modelo canônico e regras de negócio. Este package **não** depende de infraestrutura, de SDK de
fornecedor nem de fonte de dados.

Uma pasta por módulo, seguindo a seção 3.3 da especificação de produto. As pastas estão vazias de
propósito: a fase de fundação ainda não cria entidades.

Regras que pertencem aqui quando a implementação começar:

- `Property` e `Listing` são entidades diferentes; um imóvel pode ter vários anúncios ao longo do
  tempo, em fontes diferentes.
- Histórico é first-class: `ListingSnapshot` e `ListingEvent` preservam a evolução, não apenas o
  estado atual.
- Entity resolution é explicável: os critérios que uniram dois anúncios ficam registrados.
- Asking price e transaction price nunca são confundidos.
- Cálculos como preço por metro quadrado são determinísticos. Uma LLM pode explicar o resultado,
  nunca produzi-lo — veja `src/market/price-per-square-meter.ts`.
