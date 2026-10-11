import { describe, expect, it } from 'vitest';
import { DomainValidationError } from '../shared/index.js';
import {
  assertSnapshotIdentifier,
  maskSnapshotText,
  sanitizeSnapshotListing,
  snapshotContactNames,
} from './snapshot-privacy.js';

const fixture = {
  propertyType: 'apartment',
  askingPriceMinorUnits: 12_000_000,
  currency: 'BRL',
  areaSquareMeters: 50,
  bedrooms: 2,
  bathrooms: 1,
  parkingSpaces: 0,
  features: ['balcony', 'Call Maria Private +55 (11) 99999-8888'],
  location: {
    city: 'São Paulo',
    stateCode: 'SP',
    neighborhood: 'Centro',
    street: 'Rua Exemplo',
    unit: 'secret-unit',
    complement: 'secret-complement',
  },
  listedAt: '2026-10-10T00:00:00.000Z',
  advertiser: {
    type: 'private',
    agencyName: 'Maria Private',
    name: 'Maria Private',
    creci: '123456-F',
  },
  maskedDescription:
    'Maria Private offers an apartment. mail@example.test 123.456.789-01 +55 (11) 99999-8888 https://contact.invalid CRECI 123456-F',
  imageFingerprints: [`sha256:${'a'.repeat(64)}`],
  photos: ['secret-photo'],
  unknown: 'secret-unknown',
};

describe('snapshot privacy projection', () => {
  it.each([
    'Rua Exemplo, apartamento AB',
    'Rua Exemplo, apto AB',
    'Rua Exemplo, bloco Azul',
    'Rua Exemplo, bloco B12',
    'Rua Exemplo, complemento: cobertura',
    'Rua Exemplo 123 fundos',
    'Rua Exemplo; apto AB',
    'Rua Exemplo, unidade',
  ])('rejects explicit unit or complement street text at the snapshot boundary: %s', (street) => {
    expect(() =>
      sanitizeSnapshotListing({
        ...fixture,
        location: { ...fixture.location, street },
        imageFingerprints: [`sha256:${'a'.repeat(64)}`],
      }),
    ).toThrow(DomainValidationError);
  });
  it.each(['Rua Exemplo 123', 'Rua dos Apartamentos', 'Avenida Bloco Novo', 'Rua dos Fundos'])(
    'preserves ordinary street names and door numbers at the snapshot boundary: %s',
    (street) => {
      expect(
        sanitizeSnapshotListing({
          ...fixture,
          location: { ...fixture.location, street },
          imageFingerprints: [`sha256:${'a'.repeat(64)}`],
        }).location.street,
      ).toBe(street);
    },
  );
  it('removes forbidden fields and masks contacts and known names across permitted text deterministically', () => {
    const result = sanitizeSnapshotListing(fixture);
    const text = JSON.stringify(result);
    for (const forbidden of [
      'Maria Private',
      'mail@example.test',
      '123.456.789-01',
      '99999',
      'contact.invalid',
      '123456-F',
      'secret-',
    ])
      expect(text).not.toContain(forbidden);
    expect(result.advertiser.agencyName).toBeNull();
    expect(result.location.street).toBe('Rua Exemplo');
    expect(sanitizeSnapshotListing({ ...fixture })).toEqual(result);
  });
  it.each([
    null,
    [],
    '<html>private contact</html>',
    { ...fixture, location: null },
    { ...fixture, features: ['safe', 42] },
    { ...fixture, imageFingerprints: ['https://photo.invalid'] },
  ])('rejects unsupported shapes without echoing input', (input) => {
    expect(() => sanitizeSnapshotListing(input)).toThrow();
  });
  it('rejects contact-bearing identifiers and masks bare links and individual CRECI', () => {
    for (const id of ['person@example.test', '12345678901', 'Maria', '../private'])
      expect(() => assertSnapshotIdentifier(id, ['Maria'])).toThrow('Unsafe snapshot identifier.');
    expect(maskSnapshotText('example.test CRECI: 12345-F')).toBe('[REDACTED] [REDACTED]');
  });
  it.each([
    'CRECI-SP 12345-F',
    'CRECI/SP: 12345-F',
    'CRECI nº 12345-F',
    'CRECI n° 12345-F',
    'CRECI: 123.456-F',
    'CRECI N.º 12345-F',
    'CRECI n°: 12345-F',
    'CRECI (SP) 12345-F',
    'CRECI Nº. 54321-F',
    '+1 (202) 555-0123',
    '+44 (20) 7946-0958',
    '+33 (0)1 23 45 67 89',
    '01 23 45 67 89',
    '06.12.34.56.78',
    '+33 6.12.34.56.78',
    '0800 123 4567',
    '0800-123-4567',
    '+34 612 345 678',
    '+351 912 345 678',
  ])('masks regional credentials and formatted international contacts: %s', (contact) => {
    expect(maskSnapshotText(`Apartment with balcony. Contact ${contact}.`)).toBe(
      'Apartment with balcony. Contact [REDACTED].',
    );
    const result = sanitizeSnapshotListing({
      ...fixture,
      features: ['balcony', contact],
      maskedDescription: `Apartment with balcony. Contact ${contact}.`,
    });
    expect(JSON.stringify(result)).not.toContain(contact);
    expect(result.propertyType).toBe('apartment');
    expect(result.askingPriceMinorUnits).toBe(fixture.askingPriceMinorUnits);
    expect(result.areaSquareMeters).toBe(fixture.areaSquareMeters);
    expect(result.features).toContain('balcony');
  });
  it('extracts labelled first and last names before dropping their contact object', () => {
    const input = {
      ...fixture,
      contact: { firstName: 'Beatriz', lastName: 'Confidential' },
      maskedDescription: 'Beatriz Confidential offers an apartment with balcony.',
      features: ['balcony', 'Ask Beatriz Confidential'],
    };
    expect(snapshotContactNames(input)).toEqual(
      expect.arrayContaining(['Beatriz', 'Confidential']),
    );
    const result = sanitizeSnapshotListing(input);
    expect(JSON.stringify(result)).not.toContain('Beatriz');
    expect(JSON.stringify(result)).not.toContain('Confidential');
    expect(result.maskedDescription).toContain('apartment with balcony');
    expect(result.features).toContain('balcony');
    expect(result).not.toHaveProperty('contact');
  });
  it('preserves numeric listing facts in permitted text', () => {
    const facts = 'Apartment: 82.5 m², 2 bedrooms, 1 parking space, asking price R$ 450000.';
    expect(maskSnapshotText(facts)).toBe(facts);
  });
});
