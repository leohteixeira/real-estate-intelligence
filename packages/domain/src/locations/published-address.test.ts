import { describe, expect, it } from 'vitest';
import {
  normalizePlaceName,
  normalizeStreetName,
  parsePublishedAddress,
} from './published-address.js';

const address = {
  city: 'São Paulo',
  stateCode: 'SP',
  neighborhood: 'Bela Vista',
  street: 'Av. Exemplo',
};
describe('published address query', () => {
  it('normalizes only registered spelling and explicit street aliases', () => {
    expect(normalizePlaceName('  SÃO   PAULO ')).toBe('sao paulo');
    expect(normalizeStreetName(' AV.  Exémplo ')).toBe('avenida exemplo');
    expect(normalizeStreetName('R. Cenário Um')).toBe('rua cenario um');
    expect(normalizeStreetName('Rua Cenario Um')).toBe('rua cenario um');
    expect(normalizeStreetName('Travessa Exemplo')).toBe('travessa exemplo');
    expect(parsePublishedAddress(address)).toEqual({
      ...address,
      city: 'sao paulo',
      stateCode: 'sp',
      neighborhood: 'bela vista',
      street: 'avenida exemplo',
    });
  });
  it.each([
    undefined,
    null,
    [],
    'address',
    { ...address, complement: 'private' },
    { ...address, unitNumber: '2' },
    { ...address, number: -1 },
    { ...address, number: 1.5 },
    { ...address, number: Number.MAX_SAFE_INTEGER + 1 },
    { ...address, number: NaN },
    { ...address, number: '100' },
    { ...address, city: '' },
    { ...address, city: 'City\nPrivate' },
    { ...address, stateCode: 'SPO' },
    { ...address, street: 'Avenida Exemplo, 100' },
    { ...address, street: 'Rua Um apto 2' },
    { ...address, street: 'Rua Um 100' },
  ])('rejects malformed or private input before resolution', (input) => {
    expect(() => parsePublishedAddress(input)).toThrow('Invalid published address query.');
  });
  it('keeps optional zero and maximum safe integer separate from the street', () => {
    expect(parsePublishedAddress({ ...address, number: 0 }).number).toBe(0);
    expect(parsePublishedAddress({ ...address, number: Number.MAX_SAFE_INTEGER }).number).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(Object.isFrozen(parsePublishedAddress(address))).toBe(true);
  });
});
