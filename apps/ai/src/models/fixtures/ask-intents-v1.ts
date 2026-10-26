import type { AskIntent } from '@rei/contracts';
/** Fixed offline evaluation corpus; no visitor content or provider calls. */
export const askIntentEvaluationV1: readonly {
  id: string;
  query: string;
  locale: 'en' | 'pt-BR';
  intent: AskIntent;
  confident: boolean;
}[] = [
  {
    id: 'price-en',
    query: 'Calculate price per square meter for BRL 785,000 and 68 square meters.',
    locale: 'en',
    intent: 'price_per_square_meter',
    confident: true,
  },
  {
    id: 'price-pt',
    query: 'Qual é o preço por metro quadrado de R$ 785.000,00 com 68 m²?',
    locale: 'pt-BR',
    intent: 'price_per_square_meter',
    confident: true,
  },
  {
    id: 'search-en',
    query: 'Search property listings in Copacabana.',
    locale: 'en',
    intent: 'listing_search',
    confident: true,
  },
  {
    id: 'search-pt',
    query: 'Buscar anúncios de apartamentos no Centro.',
    locale: 'pt-BR',
    intent: 'listing_search',
    confident: true,
  },
  {
    id: 'history-en',
    query: 'Show the history of this property.',
    locale: 'en',
    intent: 'property_history',
    confident: true,
  },
  {
    id: 'history-pt',
    query: 'Qual é o histórico deste imóvel?',
    locale: 'pt-BR',
    intent: 'property_history',
    confident: true,
  },
  {
    id: 'statistics-en',
    query: 'Show median market statistics for this region.',
    locale: 'en',
    intent: 'region_statistics',
    confident: true,
  },
  {
    id: 'statistics-pt',
    query: 'Estatísticas e mediana da região.',
    locale: 'pt-BR',
    intent: 'region_statistics',
    confident: true,
  },
  {
    id: 'comparables-en',
    query: 'Compare these two properties.',
    locale: 'en',
    intent: 'comparables',
    confident: true,
  },
  {
    id: 'comparables-pt',
    query: 'Quero imóveis comparáveis.',
    locale: 'pt-BR',
    intent: 'comparables',
    confident: true,
  },
  {
    id: 'unsupported-en',
    query: 'Tell me a joke.',
    locale: 'en',
    intent: 'unsupported',
    confident: false,
  },
  {
    id: 'unsupported-pt',
    query: 'Qual é a previsão do tempo?',
    locale: 'pt-BR',
    intent: 'unsupported',
    confident: false,
  },
  {
    id: 'ambiguous-en',
    query: 'Search and compare properties.',
    locale: 'en',
    intent: 'listing_search',
    confident: false,
  },
  {
    id: 'ambiguous-pt',
    query: 'Buscar anúncios e comparar imóveis.',
    locale: 'pt-BR',
    intent: 'listing_search',
    confident: false,
  },
];
