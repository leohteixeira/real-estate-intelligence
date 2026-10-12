/** Market-owned formatting only: the calculation result is supplied, never recomputed here. */
export function formatPriceExplanationFacts(
  priceMinorUnits: number,
  areaSquareMeters: number,
  resultMinorUnits: number,
  locale: 'en' | 'pt-BR',
): readonly string[] {
  const money = (minor: number) => {
    const whole = Math.floor(minor / 100).toLocaleString(locale, { maximumFractionDigits: 0 });
    return `BRL ${whole}${locale === 'pt-BR' ? ',' : '.'}${String(minor % 100).padStart(2, '0')}`;
  };
  const area = String(areaSquareMeters).replace('.', locale === 'pt-BR' ? ',' : '.');
  return locale === 'pt-BR'
    ? [
        `O preço anunciado é ${money(priceMinorUnits)}.`,
        `A área é ${area} m².`,
        `O preço anunciado por metro quadrado é ${money(resultMinorUnits)}/m².`,
      ]
    : [
        `The asking price is ${money(priceMinorUnits)}.`,
        `The area is ${area} m².`,
        `The asking price per square meter is ${money(resultMinorUnits)}/m².`,
      ];
}
