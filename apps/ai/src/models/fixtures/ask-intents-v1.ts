import type { AskIntent } from '@rei/contracts';
/** Fixed offline evaluation corpus; no visitor content or provider calls. */
export const askIntentEvaluationV1: readonly {
  query: string;
  locale: 'en' | 'pt-BR';
  intent: AskIntent;
  confident: boolean;
}[] = [
  {
    query: 'Calculate price per square meter for BRL 785,000 and 68 square meters.',
    locale: 'en',
    intent: 'price_per_square_meter',
    confident: true,
  },
  {
    query: 'Qual é o preço por metro quadrado de R$ 785.000,00 com 68 m²?',
    locale: 'pt-BR',
    intent: 'price_per_square_meter',
    confident: true,
  },
  {
    query: 'Search property listings in Copacabana.',
    locale: 'en',
    intent: 'listing_search',
    confident: true,
  },
  {
    query: 'Buscar anúncios de apartamentos no Centro.',
    locale: 'pt-BR',
    intent: 'listing_search',
    confident: true,
  },
  {
    query: 'Show the history of this property.',
    locale: 'en',
    intent: 'property_history',
    confident: true,
  },
  {
    query: 'Qual é o histórico deste imóvel?',
    locale: 'pt-BR',
    intent: 'property_history',
    confident: true,
  },
  {
    query: 'Show median market statistics for this region.',
    locale: 'en',
    intent: 'region_statistics',
    confident: true,
  },
  {
    query: 'Estatísticas e mediana da região.',
    locale: 'pt-BR',
    intent: 'region_statistics',
    confident: true,
  },
  { query: 'Compare these two properties.', locale: 'en', intent: 'comparables', confident: true },
  { query: 'Quero imóveis comparáveis.', locale: 'pt-BR', intent: 'comparables', confident: true },
  { query: 'Tell me a joke.', locale: 'en', intent: 'unsupported', confident: false },
  {
    query: 'Qual é a previsão do tempo?',
    locale: 'pt-BR',
    intent: 'unsupported',
    confident: false,
  },
  {
    query: 'Search and compare properties.',
    locale: 'en',
    intent: 'listing_search',
    confident: false,
  },
  {
    query: 'Buscar anúncios e comparar imóveis.',
    locale: 'pt-BR',
    intent: 'listing_search',
    confident: false,
  },
];
