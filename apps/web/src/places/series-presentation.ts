/** Presentation-only scaling. Missing points start a new path; no interpolation across gaps. */
export function chartPaths(
  values: readonly (number | null)[],
  minimum: number,
  maximum: number,
): string[] {
  const paths: string[] = [];
  let current = '';
  for (const [index, value] of values.entries()) {
    if (value === null) {
      if (current) paths.push(current);
      current = '';
    } else
      current += `${current ? ' L' : 'M'}${chartX(index, values.length)},${chartY(value, minimum, maximum)}`;
  }
  if (current) paths.push(current);
  return paths;
}
export function chartX(index: number, length: number): number {
  return 8 + (index / (length - 1)) * 464;
}
export function chartY(value: number, minimum: number, maximum: number): number {
  return minimum === maximum ? 90 : 170 - ((value - minimum) / (maximum - minimum)) * 160;
}
export function chartEndpoints(values: readonly (number | null)[]) {
  return values.flatMap((value, index) =>
    value !== null &&
    (index === 0 ||
      index === values.length - 1 ||
      values[index - 1] === null ||
      values[index + 1] === null)
      ? [{ value, index }]
      : [],
  );
}

/** Chronological labels share the chart's month positions; formatting is presentation only. */
export function chartMonthTicks(months: readonly string[], locale: 'pt-BR' | 'en') {
  const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : locale, {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
  return [0, 5, 11].map((index) => ({
    index,
    month: months[index]!,
    label: formatter.format(new Date(`${months[index]!}-01T00:00:00Z`)),
  }));
}
