export type PriceInputRefusalReason =
  | 'missing_price'
  | 'missing_area'
  | 'ambiguous_price'
  | 'ambiguous_area'
  | 'invalid_price'
  | 'invalid_area'
  | 'unsupported_currency'
  | 'unsupported_area_unit'
  | 'unsafe_result';
export type PriceInputExtraction =
  | {
      readonly kind: 'extracted';
      readonly inputs: {
        readonly priceMinorUnits: number;
        readonly currency: 'BRL';
        readonly areaSquareMeters: number;
      };
    }
  | { readonly kind: 'refused'; readonly reason: PriceInputRefusalReason };
type Role = 'price' | 'area';
const scales: Readonly<Record<string, bigint>> = {
  k: 1000n,
  mil: 1000n,
  thousand: 1000n,
  million: 1000000n,
  millions: 1000000n,
  milhao: 1000000n,
  milhoes: 1000000n,
};
const unsupportedScales = new Set(['billion', 'billions', 'bilhao', 'bilhoes']);
const priceLabels = new Set(['price', 'preco', 'valor']);
const areaLabels = new Set(['area']);
const currencies = new Set(['r$', 'brl', 'reais', 'real']);
const currencyLabels = new Set(['currency', 'moeda']);
const currencyPrepositions = new Set(['in', 'em']);
const currencyQuoteWords = new Set(['quoted', 'cotado', 'cotada']);
const currencyCodeWords = new Set(['try', 'all', 'mad', 'top']);
const foreignCurrencyNames = new Set(['peso', 'pesos', 'franc', 'francs']);
// Known foreign markers are meaningful beside a numeric mention or explicit declaration,
// not an arbitrary uppercase word elsewhere in the question.
const foreignCurrencyCodes = new Set(
  (
    'aed afn all amd ang aoa ars aud awg azn bam bbd bdt bgn bhd bif bmd bnd bob bov bsd btn ' +
    'bwp byn bzd cad cdf che chf chw clf clp cny cop cou crc cuc cup cve czk djf dkk dop dzd ' +
    'egp ern etb eur fjd fkp gbp gel ghs gip gmd gnf gtq gyd hkd hnl hrk htg huf idr ils inr ' +
    'iqd irr isk jmd jod jpy kes kgs khr kmf kpw krw kwd kyd kzt lak lbp lkr lrd lsl lyd ' +
    'mad mdl mga mkd mmk mnt mop mru mur mvr mwk mxn mxv myr mzn nad ngn nio nok npr nzd ' +
    'omr pab pen pgk php pkr pln pyg qar ron rsd rub rwf sar sbd scr sdg sek sgd shp sle sll ' +
    'sos srd ssp stn svc syp szl thb tjs tmt tnd top try ttd twd tzs uah ugx usd usn uyu ' +
    'uyw uzs ved ves vnd vuv wst xaf xag xau xba xbb xbc xbd xcd xdr xof xpd xpf xpt ' +
    'xsu xua yer zar zmw zwl zwg btc eth usdt usdc'
  ).split(' '),
);
const squareUnits = new Set(['m2', 'm²']);
const rangeWords = new Set(['to', 'a', 'ate', 'or', 'ou']);
const coordinationWords = new Set(['and', 'e', 'vs']);
const contextNumberUnits = new Set([
  'bedroom',
  'bedrooms',
  'quarto',
  'quartos',
  'year',
  'years',
  'ano',
  'anos',
  'street',
  'streets',
  'rua',
  'ruas',
]);
const refused = (reason: PriceInputRefusalReason): PriceInputExtraction => ({
  kind: 'refused',
  reason,
});

/** Bounded v1 grammar. A token is consumed whole; malformed numbers are never salvaged. */
export function extractPriceInputs(query: string, locale: 'en' | 'pt-BR'): PriceInputExtraction {
  if (query.length > 16000 || !query.trim()) return refused('missing_price');
  const normalized = query.normalize('NFD').replace(/\p{M}/gu, '').replace(/[–—]/g, '-');
  const originalTokens = (
    normalized.match(/us\$|r\$|[\p{Sc}]|[+−.,\d-][^\s?!()[\]{}<>\p{Sc}]*|[\p{L}\p{N}²]+/giu) ?? []
  )
    .filter((token) => token !== ',' && token !== '.')
    .map((token) => token.replace(/[.,]$/, ''));
  const tokens = originalTokens.map((token) => token.toLowerCase());
  const hasCurrencyReference = (index: number) => {
    let previous = index - 1;
    const hasModifier = tokens[previous] === 'swiss';
    if (hasModifier) previous--;
    if (currencyPrepositions.has(tokens[previous] ?? '')) {
      previous--;
      if (currencyQuoteWords.has(tokens[previous] ?? '')) previous--;
    } else if (!hasModifier) return false;
    return (
      /^[+−.,\d-]/.test(tokens[previous] ?? '') ||
      (scales[tokens[previous] ?? ''] !== undefined &&
        /^[+−.,\d-]/.test(tokens[previous - 1] ?? ''))
    );
  };
  if (
    tokens.some((token, index) =>
      currencyLabels.has(token)
        ? !currencies.has(tokens[index + 1] ?? '')
        : (foreignCurrencyNames.has(token) ||
            (foreignCurrencyCodes.has(token) &&
              (!currencyCodeWords.has(token) || originalTokens[index] === token.toUpperCase()))) &&
          (/^[+−.,\d-]/.test(tokens[index - 1] ?? '') ||
            /^[+−.,\d-]/.test(tokens[index + 1] ?? '') ||
            priceLabels.has(tokens[index - 1] ?? '') ||
            currencies.has(tokens[index - 1] ?? '') ||
            currencies.has(tokens[index + 1] ?? '') ||
            hasCurrencyReference(index) ||
            (scales[tokens[index - 1] ?? ''] !== undefined &&
              /^[+−.,\d-]/.test(tokens[index - 2] ?? ''))),
    )
  )
    return refused('unsupported_currency');
  if (
    tokens.some(
      (token) =>
        /^\p{Sc}$/u.test(token) ||
        [
          'usd',
          'us$',
          'eur',
          'euro',
          'euros',
          'dollar',
          'dollars',
          '$',
          'gbp',
          '€',
          '£',
          '¥',
          'cad',
          'aud',
          'jpy',
          'cny',
        ].includes(token),
    )
  )
    return refused('unsupported_currency');
  if (
    tokens.some(
      (token, index) =>
        [
          'ft',
          'ft2',
          'ft²',
          'feet',
          'foot',
          'pe',
          'pes',
          'hectare',
          'hectares',
          'acre',
          'acres',
          'mile',
          'miles',
          'milha',
          'milhas',
          'yd',
          'yd2',
          'yd²',
          'yard',
          'yards',
          'km',
          'km2',
          'km²',
          'kilometer',
          'kilometers',
          'kilometre',
          'kilometres',
          'quilometro',
          'quilometros',
          'm3',
          'm³',
          'cm',
          'cm2',
          'cm²',
          'mm',
          'mm2',
          'mm²',
          'inch',
          'inches',
          'in2',
          'in²',
        ].includes(token) ||
        (token === 'ha' &&
          (/^[+−.,\d-]/.test(tokens[index - 1] ?? '') ||
            (areaLabels.has(tokens[index - 1] ?? '') &&
              /^[+−.,\d-]/.test(tokens[index + 1] ?? '')))),
    )
  )
    return refused('unsupported_area_unit');
  const candidates: Record<
    Role,
    { token: string; scale: bigint; invalidScale: boolean; range: boolean }[]
  > = { price: [], area: [] };
  const isAreaUnit = (index: number) =>
    squareUnits.has(tokens[index] ?? '') ||
    (tokens[index] === 'square' &&
      ['meter', 'meters', 'metre', 'metres'].includes(tokens[index + 1] ?? '')) ||
    (['metro', 'metros'].includes(tokens[index] ?? '') &&
      ['quadrado', 'quadrados'].includes(tokens[index + 1] ?? ''));
  let previousRole: Role | undefined;
  for (const [index, rawToken] of tokens.entries()) {
    const attachedScale = /^(\d[\d.,]*)k$/.exec(rawToken);
    const token = attachedScale?.[1] ?? rawToken;
    if (!/^[+\-−.,\d]/.test(token) && !['nan', 'infinity', 'inf'].includes(token)) continue;
    if (token === '-') continue;
    const before = tokens[index - 1] ?? '';
    let afterIndex = index + 1;
    const scale = attachedScale ? 1000n : (scales[tokens[afterIndex] ?? ''] ?? 1n);
    if (scale !== 1n && !attachedScale) afterIndex++;
    const invalidScale =
      scales[tokens[afterIndex] ?? ''] !== undefined ||
      unsupportedScales.has(tokens[afterIndex] ?? '');
    const price =
      priceLabels.has(before) || currencies.has(before) || currencies.has(tokens[afterIndex] ?? '');
    const area = areaLabels.has(before) || isAreaUnit(afterIndex);
    const range =
      /^\d[\d.,]*-\d/.test(token) ||
      rangeWords.has(tokens[index + 1] ?? '') ||
      rangeWords.has(before) ||
      tokens[index + 1] === '-' ||
      before === '-';
    let role: Role | undefined = price ? 'price' : area ? 'area' : undefined;
    if (price && area) return refused('ambiguous_price');
    if (!role && (rangeWords.has(before) || before === '-' || /^\d/.test(before)))
      role = previousRole;
    if (!role && coordinationWords.has(before) && !contextNumberUnits.has(tokens[afterIndex] ?? ''))
      role = previousRole;
    if (!role && range && isAreaUnit(index + 3)) role = 'area';
    if (!role) continue;
    candidates[role].push({ token, scale, invalidScale, range });
    previousRole = role;
  }
  for (const role of ['price', 'area'] as const) {
    const found = candidates[role];
    if (!found.length) return refused(role === 'price' ? 'missing_price' : 'missing_area');
    if (found.length > 1 || found[0]!.range)
      return refused(role === 'price' ? 'ambiguous_price' : 'ambiguous_area');
  }
  const parse = (role: Role): number | null => {
    const candidate = candidates[role][0]!;
    if (candidate.invalidScale) return null;
    const grouping = locale === 'en' ? ',' : '.',
      decimal = locale === 'en' ? '.' : ',';
    const pattern =
      locale === 'en'
        ? /^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/
        : /^(?:\d+|[1-9]\d{0,2}(?:\.\d{3})+)(?:,\d+)?$/;
    if (!pattern.test(candidate.token)) return null;
    const [integer, fraction = ''] = candidate.token.split(decimal);
    if (fraction.length > 12) return null;
    const digits = integer!.split(grouping).join('') + fraction;
    const numerator = BigInt(digits) * candidate.scale * (role === 'price' ? 100n : 1n);
    const denominator = 10n ** BigInt(fraction.length);
    if (role === 'price') {
      if (numerator % denominator !== 0n) return null;
      const minorUnits = numerator / denominator;
      return minorUnits > 0n && minorUnits <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(minorUnits)
        : null;
    }
    const area = Number(numerator) / Number(denominator);
    return Number.isFinite(area) && area > 0 && area <= 1000000 ? area : null;
  };
  const priceMinorUnits = parse('price');
  if (priceMinorUnits === null) return refused('invalid_price');
  const areaSquareMeters = parse('area');
  if (areaSquareMeters === null) return refused('invalid_area');
  return { kind: 'extracted', inputs: { priceMinorUnits, currency: 'BRL', areaSquareMeters } };
}
