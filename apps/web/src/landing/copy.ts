/**
 * Landing page copy in both locales.
 *
 * Every figure below is a fixed, synthetic illustration. Nothing is calculated
 * here: the frontend only formats values for the active locale.
 */
import type { ZoneId } from './cityLayout';

export type Locale = 'en' | 'pt';

/** Brazilian Portuguese is the primary locale; it comes first in the switch. */
export const LOCALES: readonly Locale[] = ['pt', 'en'];

export interface PlateCopy {
  readonly over: string;
  readonly name: string;
  readonly strip: string;
  readonly zone: ZoneId | 'city';
}

export interface ProofLine {
  readonly label: string;
  readonly value: string;
  readonly tag?: 'asking' | 'state';
}

export interface StopCopy {
  readonly id: string;
  readonly way: string;
  readonly plate: PlateCopy;
  readonly heading: string;
  readonly body: string;
  readonly points: readonly string[];
  readonly proof: readonly ProofLine[];
  readonly provenance: string;
}

export interface RunStep {
  readonly state: string;
  readonly text: string;
  readonly detail?: readonly string[];
  readonly note?: string;
}

export interface RuleCopy {
  readonly rule: string;
  readonly meaning: string;
}

export interface LandingCopy {
  readonly htmlLang: string;
  readonly documentTitle: string;
  readonly skip: string;
  readonly languageLabel: string;
  readonly stopsLabel: string;
  readonly here: string;
  readonly synthetic: string;
  readonly asking: string;
  readonly openDemo: string;
  readonly takeTour: string;
  readonly demoPending: string;
  readonly source: string;
  readonly heroTitle: string;
  readonly heroLead: string;
  readonly heroLegend: string;
  readonly heroCue: string;
  readonly stops: readonly StopCopy[];
  readonly runTitle: string;
  readonly runLead: string;
  readonly runSteps: readonly RunStep[];
  readonly rulesTitle: string;
  readonly rules: readonly RuleCopy[];
  readonly closeTitle: string;
  readonly closeLead: string;
  readonly statusTitle: string;
  readonly statusBuilt: string;
  readonly statusDesigned: string;
  readonly footer: string;
  readonly privacy: string;
}

interface Formatters {
  readonly money: (value: number) => string;
  readonly perSquareMeter: (value: number) => string;
  readonly count: (value: number) => string;
  readonly percent: (value: number) => string;
  readonly decimal: (value: number) => string;
}

function formattersFor(tag: string): Formatters {
  const integer = new Intl.NumberFormat(tag, { maximumFractionDigits: 0 });
  const oneDecimal = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const twoDecimals = new Intl.NumberFormat(tag, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    money: (value) => `R$ ${integer.format(value)}`,
    perSquareMeter: (value) => `R$ ${integer.format(value)}/m²`,
    count: (value) => integer.format(value),
    percent: (value) => `${oneDecimal.format(value)}%`,
    decimal: (value) => twoDecimals.format(value),
  };
}

function english(): LandingCopy {
  const f = formattersFor('en-US');
  const stamp = '9 Oct 2026, 06:00';

  return {
    htmlLang: 'en',
    documentTitle: 'Real Estate Intelligence — read the market, not the listings',
    skip: 'Skip to the content',
    languageLabel: 'Language',
    stopsLabel: 'Stops on the way down',
    here: 'You are here',
    synthetic: 'Synthetic data',
    asking: 'Asking',
    openDemo: 'Open the demo',
    takeTour: 'Take the tour',
    demoPending: 'The public demo is not published yet.',
    source: 'Source code',
    heroTitle: 'Read the market, not the listings.',
    heroLead:
      'Real Estate Intelligence turns public property listings into a market you can read place by place: asking prices per square meter, their history, comparables and time on market, each one with its source and its date.',
    heroLegend: 'Each block is a street block. Its height is the median asking price per m².',
    heroCue: 'Walk down to a street block',
    stops: [
      {
        id: 'city',
        way: 'City',
        plate: {
          over: 'SP · Brasil',
          name: 'São Paulo',
          strip: `5 zones · ${f.count(484)} street blocks`,
          zone: 'city',
        },
        heading: '',
        body: '',
        points: [],
        proof: [],
        provenance: '',
      },
      {
        id: 'zone',
        way: 'Zone',
        plate: {
          over: 'São Paulo · SP',
          name: 'Zona Oeste',
          strip: `${f.count(1284)} listings`,
          zone: 'oeste',
        },
        heading: 'Is the zone moving, or only this listing?',
        body: 'Brokers and analysts read a place as a series, not as a feed. Every aggregate says how many listings it stands on, which sources reported them and when it was last computed.',
        points: [
          'Median asking price per m² by zone, neighborhood and street block',
          'Movement over time, with the sample behind every point',
          'Time on market, removals and returns to market',
        ],
        proof: [
          { label: 'Median asking price', value: f.perSquareMeter(10920), tag: 'asking' },
          { label: '90 days', value: `+${f.percent(3.1)}` },
        ],
        provenance: `${f.count(1284)} listings · 3 sources · ${stamp}`,
      },
      {
        id: 'neighborhood',
        way: 'Neighborhood',
        plate: { over: 'São Paulo · SP', name: 'Pinheiros', strip: 'Zona Oeste', zone: 'oeste' },
        heading: 'Is this apartment priced like its neighbors?',
        body: 'Buyers and investors see one property against the comparables around it, selected by stated criteria you can read and change. An asking price is never presented as what a property sold for.',
        points: [
          'Comparables with the reason each one was selected',
          'Price history of the listing, cut by cut',
          'Alerts when a watched place or property changes',
        ],
        proof: [
          { label: '68 m² · 2 bedrooms', value: f.money(785000), tag: 'asking' },
          { label: 'Against the neighborhood median', value: `${f.percent(7.5)} below` },
          { label: 'Time on market', value: '64 days' },
        ],
        provenance: `Median ${f.perSquareMeter(12480)} · 212 properties · ${stamp}`,
      },
      {
        id: 'block',
        way: 'Street block',
        plate: {
          over: 'Pinheiros · Zona Oeste',
          name: 'Rua dos Pinheiros',
          strip: '1200 – 1298',
          zone: 'oeste',
        },
        heading: 'Three listings. One property. Here is why.',
        body: 'For the engineer evaluating the work: a property and a listing are separate entities, history is first-class, and entity resolution explains itself. Every merge carries its evidence and can be reviewed.',
        points: [
          'Deterministic price, comparable and geospatial rules in the backend',
          'Raw snapshots and provenance kept for reprocessing and audit',
          'Traces across HTTP requests, jobs, collectors and model calls',
        ],
        proof: [
          { label: 'Source A · first seen 6 Aug', value: f.money(785000), tag: 'asking' },
          { label: 'Source B · first seen 11 Aug', value: f.money(790000), tag: 'asking' },
          { label: 'Source C · returned to market 2 Oct', value: f.money(785000), tag: 'asking' },
          { label: 'Resolved as one property', value: `match ${f.decimal(0.91)}` },
        ],
        provenance: 'Same number range · 68 m² · floor 7',
      },
      {
        id: 'plan',
        way: 'Collectors',
        plate: {
          over: 'São Paulo · SP',
          name: 'Collectors',
          strip: '2 of 4 slots in use',
          zone: 'city',
        },
        heading: 'What ran, what changed and what failed?',
        body: 'Data operators see collection as counted work. Runs are idempotent and checkpointed, concurrency is a visible number of slots, and nothing is fetched outside the terms of its source.',
        points: [
          'Rate limits, retries with backoff and graceful shutdown',
          'Reprocessing from raw snapshots, isolated from routine actions',
          'A review queue for the matches the rules could not settle',
        ],
        proof: [
          { label: 'Last run', value: stamp, tag: 'state' },
          { label: 'Snapshots read', value: f.count(1284) },
          { label: 'Changed', value: f.count(212) },
          { label: 'Failed', value: f.count(0) },
        ],
        provenance: 'Robots, rate limits and licensing respected per source',
      },
    ],
    runTitle: 'Ask in plain language. Get a run you can audit.',
    runLead:
      'A question does not open a chat. It becomes a typed request you confirm, a calculation the backend performs and an explanation labelled as written by a model.',
    runSteps: [
      {
        state: 'Question',
        text: 'What is the price per square meter of two-bedroom apartments in Pinheiros?',
      },
      {
        state: 'Waiting for you',
        text: 'Interpreted as a price per m² request. Confidence was below the 0.85 gate, so the run paused for confirmation.',
        detail: ['Place · Pinheiros', 'Type · apartment', 'Bedrooms · 2'],
      },
      {
        state: 'Completed',
        text: `${f.perSquareMeter(12480)} median asking price`,
        note: `Computed by the backend · 212 properties · ${stamp}`,
      },
      {
        state: 'Explanation',
        text: 'Asking prices in Pinheiros sit above the Zona Oeste median, and most of the sample was listed in the last 90 days.',
        note: 'Written by a model about the figure above. It did not produce the figure.',
      },
    ],
    rulesTitle: 'Four rules the product does not bend.',
    rules: [
      {
        rule: 'Asking is not sale.',
        meaning:
          'A listing carries an asking price. A sale price appears only when a source reports a transaction, and the two are never averaged together.',
      },
      {
        rule: 'A model explains. It never computes.',
        meaning:
          'Medians, comparables and geospatial filters are deterministic backend rules. A model may route a question or explain a result.',
      },
      {
        rule: 'The street block, never the unit.',
        meaning:
          'A property is located to its street block and number range. No screen pins a front door.',
      },
      {
        rule: 'The source sets the terms.',
        meaning:
          'Collectors follow robots rules, rate limits and licensing. In development the product runs on synthetic datasets.',
      },
    ],
    closeTitle: 'Start from a place.',
    closeLead:
      'Pick a zone, a neighborhood or a street block and read what the listings add up to.',
    statusTitle: 'Where the project stands',
    statusBuilt:
      'Built: the foundation. Four applications, configuration, telemetry, the database connection, health endpoints and one deterministic rule, price per square meter.',
    statusDesigned:
      'Designed, not built yet: collectors, comparables, the natural-language runs and the screens. Every figure on this page is synthetic.',
    footer: 'Real Estate Intelligence · a portfolio project · figures in BRL',
    privacy: 'Privacy',
  };
}

function portuguese(): LandingCopy {
  const f = formattersFor('pt-BR');
  const stamp = '9 out. 2026, 06:00';

  return {
    htmlLang: 'pt-BR',
    documentTitle: 'Real Estate Intelligence — leia o mercado, não os anúncios',
    skip: 'Ir para o conteúdo',
    languageLabel: 'Idioma',
    stopsLabel: 'Paradas da descida',
    here: 'Você está aqui',
    synthetic: 'Dados sintéticos',
    asking: 'Pedido',
    openDemo: 'Abrir a demo',
    takeTour: 'Fazer o percurso',
    demoPending: 'A demo pública ainda não foi publicada.',
    source: 'Código-fonte',
    heroTitle: 'Leia o mercado, não os anúncios.',
    heroLead:
      'O Real Estate Intelligence transforma anúncios públicos de imóveis em um mercado que se lê lugar a lugar: preço pedido por metro quadrado, histórico, comparáveis e tempo de anúncio, cada um com a sua fonte e a sua data.',
    heroLegend: 'Cada bloco é uma quadra. A altura é a mediana do preço pedido por m².',
    heroCue: 'Desça até uma quadra',
    stops: [
      {
        id: 'city',
        way: 'Cidade',
        plate: {
          over: 'SP · Brasil',
          name: 'São Paulo',
          strip: `5 zonas · ${f.count(484)} quadras`,
          zone: 'city',
        },
        heading: '',
        body: '',
        points: [],
        proof: [],
        provenance: '',
      },
      {
        id: 'zone',
        way: 'Zona',
        plate: {
          over: 'São Paulo · SP',
          name: 'Zona Oeste',
          strip: `${f.count(1284)} anúncios`,
          zone: 'oeste',
        },
        heading: 'É a zona que está mexendo, ou só este anúncio?',
        body: 'Corretores e analistas leem um lugar como uma série, não como um feed. Todo agregado diz sobre quantos anúncios se apoia, quais fontes os reportaram e quando foi calculado.',
        points: [
          'Mediana do preço pedido por m² por zona, bairro e quadra',
          'Variação ao longo do tempo, com a amostra por trás de cada ponto',
          'Tempo de anúncio, remoções e retornos ao mercado',
        ],
        proof: [
          { label: 'Mediana do preço pedido', value: f.perSquareMeter(10920), tag: 'asking' },
          { label: '90 dias', value: `+${f.percent(3.1)}` },
        ],
        provenance: `${f.count(1284)} anúncios · 3 fontes · ${stamp}`,
      },
      {
        id: 'neighborhood',
        way: 'Bairro',
        plate: { over: 'São Paulo · SP', name: 'Pinheiros', strip: 'Zona Oeste', zone: 'oeste' },
        heading: 'Este apartamento está no preço dos vizinhos?',
        body: 'Compradores e investidores veem um imóvel contra os comparáveis ao redor, escolhidos por critérios declarados que dá para ler e alterar. Preço pedido nunca é apresentado como preço de venda.',
        points: [
          'Comparáveis com o motivo de cada escolha',
          'Histórico de preço do anúncio, corte a corte',
          'Alertas quando um lugar ou imóvel acompanhado muda',
        ],
        proof: [
          { label: '68 m² · 2 quartos', value: f.money(785000), tag: 'asking' },
          { label: 'Contra a mediana do bairro', value: `${f.percent(7.5)} abaixo` },
          { label: 'Tempo de anúncio', value: '64 dias' },
        ],
        provenance: `Mediana ${f.perSquareMeter(12480)} · 212 imóveis · ${stamp}`,
      },
      {
        id: 'block',
        way: 'Quadra',
        plate: {
          over: 'Pinheiros · Zona Oeste',
          name: 'Rua dos Pinheiros',
          strip: '1200 – 1298',
          zone: 'oeste',
        },
        heading: 'Três anúncios. Um imóvel. E o porquê.',
        body: 'Para quem avalia a engenharia: imóvel e anúncio são entidades separadas, o histórico é de primeira classe e a resolução de entidades se explica. Toda fusão carrega a sua evidência e pode ser revisada.',
        points: [
          'Regras determinísticas de preço, comparáveis e geoespacial no backend',
          'Snapshots brutos e proveniência guardados para reprocessar e auditar',
          'Traces em requisições HTTP, jobs, coletores e chamadas de modelo',
        ],
        proof: [
          { label: 'Fonte A · visto em 6 ago.', value: f.money(785000), tag: 'asking' },
          { label: 'Fonte B · visto em 11 ago.', value: f.money(790000), tag: 'asking' },
          { label: 'Fonte C · voltou ao mercado em 2 out.', value: f.money(785000), tag: 'asking' },
          { label: 'Resolvidos como um imóvel', value: `match ${f.decimal(0.91)}` },
        ],
        provenance: 'Mesma faixa de numeração · 68 m² · 7º andar',
      },
      {
        id: 'plan',
        way: 'Coletores',
        plate: {
          over: 'São Paulo · SP',
          name: 'Coletores',
          strip: '2 de 4 vagas em uso',
          zone: 'city',
        },
        heading: 'O que rodou, o que mudou e o que falhou?',
        body: 'Quem opera os dados vê a coleta como trabalho contado. As execuções são idempotentes e têm checkpoint, a concorrência é um número visível de vagas e nada é buscado fora dos termos da fonte.',
        points: [
          'Limites de taxa, novas tentativas com backoff e desligamento gracioso',
          'Reprocessamento a partir dos snapshots brutos, isolado das ações de rotina',
          'Fila de revisão para as fusões que as regras não resolveram',
        ],
        proof: [
          { label: 'Última execução', value: stamp, tag: 'state' },
          { label: 'Snapshots lidos', value: f.count(1284) },
          { label: 'Alterados', value: f.count(212) },
          { label: 'Com falha', value: f.count(0) },
        ],
        provenance: 'Robots, limites de taxa e licenciamento respeitados por fonte',
      },
    ],
    runTitle: 'Pergunte em linguagem natural. Receba uma execução auditável.',
    runLead:
      'Uma pergunta não abre um chat. Ela vira um pedido tipado que você confirma, um cálculo feito pelo backend e uma explicação marcada como escrita por um modelo.',
    runSteps: [
      {
        state: 'Pergunta',
        text: 'Qual é o preço por metro quadrado de apartamentos de dois quartos em Pinheiros?',
      },
      {
        state: 'Aguardando você',
        text: 'Interpretada como um pedido de preço por m². A confiança ficou abaixo do limiar de 0,85, então a execução pausou para confirmação.',
        detail: ['Lugar · Pinheiros', 'Tipo · apartamento', 'Quartos · 2'],
      },
      {
        state: 'Concluída',
        text: `${f.perSquareMeter(12480)} de mediana do preço pedido`,
        note: `Calculado pelo backend · 212 imóveis · ${stamp}`,
      },
      {
        state: 'Explicação',
        text: 'Os preços pedidos em Pinheiros ficam acima da mediana da Zona Oeste, e a maior parte da amostra foi anunciada nos últimos 90 dias.',
        note: 'Escrita por um modelo sobre o número acima. O modelo não produziu o número.',
      },
    ],
    rulesTitle: 'Quatro regras que o produto não dobra.',
    rules: [
      {
        rule: 'Pedido não é venda.',
        meaning:
          'Um anúncio traz um preço pedido. O preço de venda só aparece quando uma fonte reporta a transação, e os dois nunca entram na mesma média.',
      },
      {
        rule: 'O modelo explica. Nunca calcula.',
        meaning:
          'Medianas, comparáveis e filtros geoespaciais são regras determinísticas do backend. Um modelo pode rotear uma pergunta ou explicar um resultado.',
      },
      {
        rule: 'A quadra, nunca a unidade.',
        meaning:
          'Um imóvel é localizado até a quadra e a faixa de numeração. Nenhuma tela marca uma porta.',
      },
      {
        rule: 'A fonte dita os termos.',
        meaning:
          'Os coletores seguem robots, limites de taxa e licenciamento. Em desenvolvimento, o produto roda sobre dados sintéticos.',
      },
    ],
    closeTitle: 'Comece por um lugar.',
    closeLead: 'Escolha uma zona, um bairro ou uma quadra e leia o que os anúncios somam.',
    statusTitle: 'Em que pé o projeto está',
    statusBuilt:
      'Construído: a fundação. Quatro aplicações, configuração, telemetria, a conexão com o banco, endpoints de saúde e uma regra determinística, o preço por metro quadrado.',
    statusDesigned:
      'Desenhado, ainda não construído: coletores, comparáveis, as execuções em linguagem natural e as telas. Todo número desta página é sintético.',
    footer: 'Real Estate Intelligence · um projeto de portfólio · valores em BRL',
    privacy: 'Privacidade',
  };
}

const COPY: Record<Locale, LandingCopy> = { en: english(), pt: portuguese() };

export function copyFor(locale: Locale): LandingCopy {
  return COPY[locale];
}
