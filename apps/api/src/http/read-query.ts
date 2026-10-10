import { BadRequestException } from '@nestjs/common';
import { DomainValidationError, parseUuidV7, type SearchQuery } from '@rei/domain';
import { validateReadQuery } from '@rei/infrastructure';
import type { Request } from 'express';

export function readQuery(request: Request, mode: 'search' | 'page' | 'none'): SearchQuery {
  const parameters = new URL(request.originalUrl, 'http://localhost').searchParams;
  const result: Record<string, string | number | boolean> = Object.create(null) as Record<
    string,
    string | number | boolean
  >;
  for (const [key, value] of parameters) {
    if (Object.hasOwn(result, key) || mode === 'none') throw new BadRequestException();
    if (['priceReduced', 'returnedToMarket', 'multipleListings'].includes(key)) {
      if (value !== 'true' && value !== 'false') throw new BadRequestException();
      result[key] = value === 'true';
    } else if (key.startsWith('min') || key.startsWith('max') || key === 'pageSize') {
      if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) throw new BadRequestException();
      // Validate decimal text before Number can round away a fraction or bound violation.
      const [whole = '0', fraction = ''] = value.split('.');
      if (key === 'minArea' || key === 'maxArea') {
        const belowMinimum = whole === '0' && fraction.slice(0, 2).padEnd(2, '0') < '01';
        const aboveMaximum =
          whole.length > 7 ||
          (whole.length === 7 &&
            (whole > '1000000' || (whole === '1000000' && /[1-9]/.test(fraction))));
        if (belowMinimum || aboveMaximum) throw new BadRequestException();
      } else if (/[1-9]/.test(fraction)) throw new BadRequestException();
      result[key] = Number(value);
    } else result[key] = value;
  }
  const query = result as SearchQuery;
  try {
    validateReadQuery(query, mode === 'search');
  } catch {
    throw new BadRequestException();
  }
  return query;
}
export function readId(value: string, kind: 'uuid' | 'place'): string {
  try {
    if (kind === 'uuid') return parseUuidV7(value);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) || value.length > 200)
      throw new BadRequestException();
    return value;
  } catch {
    throw new BadRequestException();
  }
}
export async function readResult<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof DomainValidationError) throw new BadRequestException();
    throw error;
  }
}
