import {
  SYNTHETIC_SAO_PAULO_LISTING_REFERENCES,
  type CollectedListing,
  type SyntheticSaoPauloListingReference,
} from '@rei/domain';

export const SYNTHETIC_SAO_PAULO_DATASET_VERSION = 'synthetic-sao-paulo-v1' as const;

export type SyntheticSaoPauloPortal = Readonly<{
  readonly sourceId: string;
  readonly displayLabel: string;
  readonly baseUrl: string;
}>;

export type SyntheticSaoPauloPlace = Readonly<{
  readonly neighborhood: string;
  readonly zone: 'Centro' | 'Norte' | 'Sul' | 'Leste' | 'Oeste';
}>;

export type SyntheticSaoPauloProperty = Readonly<{
  readonly propertyLabel: string;
  readonly neighborhood: string;
  readonly listingReferences: readonly SyntheticSaoPauloListingReference[];
}>;

export type SyntheticSaoPauloListing = Readonly<{
  readonly reference: SyntheticSaoPauloListingReference;
  readonly sourceUrl: string;
  readonly listing: CollectedListing;
}>;

export type SyntheticSaoPauloRunObservation = Readonly<{
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly sourceUrl: string;
  readonly observedAt: string;
  readonly listing: CollectedListing;
}>;

export type SyntheticSaoPauloRun = Readonly<{
  readonly runKey: string;
  readonly observedAt: string;
  readonly observations: readonly SyntheticSaoPauloRunObservation[];
}>;

export type SyntheticSaoPauloDataset = Readonly<{
  readonly version: typeof SYNTHETIC_SAO_PAULO_DATASET_VERSION;
  readonly sources: readonly SyntheticSaoPauloPortal[];
  readonly places: readonly SyntheticSaoPauloPlace[];
  readonly properties: readonly SyntheticSaoPauloProperty[];
  readonly listings: readonly SyntheticSaoPauloListing[];
  readonly runs: readonly SyntheticSaoPauloRun[];
}>;

const [
  AURORA_BELA_VISTA_1,
  AURORA_PINHEIROS,
  AURORA_SANTANA,
  BRISA_BELA_VISTA,
  BRISA_SANTANA,
  BRISA_VILA_MARIANA,
  COBALTO_BELA_VISTA,
  COBALTO_TATUAPE,
  COBALTO_VILA_MARIANA,
] = SYNTHETIC_SAO_PAULO_LISTING_REFERENCES;

const SOURCES = Object.freeze([
  Object.freeze({
    sourceId: 'synthetic-portal-aurora',
    displayLabel: 'Synthetic data — Aurora',
    baseUrl: 'https://aurora.synthetic.invalid',
  }),
  Object.freeze({
    sourceId: 'synthetic-portal-brisa',
    displayLabel: 'Synthetic data — Brisa',
    baseUrl: 'https://brisa.synthetic.invalid',
  }),
  Object.freeze({
    sourceId: 'synthetic-portal-cobalto',
    displayLabel: 'Synthetic data — Cobalto',
    baseUrl: 'https://cobalto.synthetic.invalid',
  }),
] as const satisfies readonly SyntheticSaoPauloPortal[]);

const PLACES = Object.freeze([
  Object.freeze({ neighborhood: 'Bela Vista', zone: 'Centro' as const }),
  Object.freeze({ neighborhood: 'Santana', zone: 'Norte' as const }),
  Object.freeze({ neighborhood: 'Vila Mariana', zone: 'Sul' as const }),
  Object.freeze({ neighborhood: 'Tatuapé', zone: 'Leste' as const }),
  Object.freeze({ neighborhood: 'Pinheiros', zone: 'Oeste' as const }),
] satisfies readonly SyntheticSaoPauloPlace[]);

function frozenListing(input: CollectedListing): CollectedListing {
  return Object.freeze({
    ...input,
    features: Object.freeze([...input.features]),
    location: Object.freeze({ ...input.location }),
    advertiser: Object.freeze({ ...input.advertiser }),
    imageFingerprints: Object.freeze([...input.imageFingerprints]),
  });
}

function fixtureListing(
  reference: SyntheticSaoPauloListingReference,
  sourceUrl: string,
  listing: CollectedListing,
): SyntheticSaoPauloListing {
  return Object.freeze({ reference, sourceUrl, listing: frozenListing(listing) });
}

const NEAR_NEIGHBOR_DESCRIPTION =
  'Synthetic apartment with a balcony near transit and local services.';

const LISTINGS = Object.freeze([
  fixtureListing(AURORA_BELA_VISTA_1, 'https://aurora.synthetic.invalid/listings/AUR-BV-001', {
    propertyType: 'apartment',
    askingPriceMinorUnits: 82_000_000,
    currency: 'BRL',
    areaSquareMeters: 82,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: ['balcony', 'elevator'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Rua Cenário Um',
    },
    listedAt: '2025-08-15T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Aurora Synthetic Data Ltda.' },
    maskedDescription: NEAR_NEIGHBOR_DESCRIPTION,
    imageFingerprints: [
      'fixture-fingerprint:property-bv-001:shared-01',
      'fixture-fingerprint:near-neighbor:urban-01',
    ],
  }),
  fixtureListing(AURORA_PINHEIROS, 'https://aurora.synthetic.invalid/listings/AUR-PN-001', {
    propertyType: 'apartment',
    askingPriceMinorUnits: 81_500_000,
    currency: 'BRL',
    areaSquareMeters: 82,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: ['balcony', 'elevator'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Pinheiros',
      street: 'Rua Cenário Seis',
    },
    listedAt: '2025-09-02T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Aurora Synthetic Data Ltda.' },
    maskedDescription: NEAR_NEIGHBOR_DESCRIPTION,
    imageFingerprints: [
      'fixture-fingerprint:property-pn-001:own-01',
      'fixture-fingerprint:near-neighbor:urban-01',
    ],
  }),
  fixtureListing(AURORA_SANTANA, 'https://aurora.synthetic.invalid/listings/AUR-SN-001', {
    propertyType: 'apartment',
    askingPriceMinorUnits: 67_000_000,
    currency: 'BRL',
    areaSquareMeters: 74,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 1,
    features: ['elevator', 'playground'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Santana',
      street: 'Rua Cenário Três',
    },
    listedAt: '2025-07-20T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Aurora Synthetic Data Ltda.' },
    maskedDescription: 'Synthetic three-bedroom apartment with a playground nearby.',
    imageFingerprints: ['fixture-fingerprint:property-sn-001:shared-01'],
  }),
  fixtureListing(BRISA_BELA_VISTA, 'https://brisa.synthetic.invalid/listings/BRI-BV-001', {
    propertyType: 'apartment',
    askingPriceMinorUnits: 83_000_000,
    currency: 'BRL',
    areaSquareMeters: 82,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: ['balcony', 'elevator'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Rua Cenário Um',
    },
    listedAt: '2025-08-18T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Brisa Synthetic Data Ltda.' },
    maskedDescription: 'Synthetic apartment with balcony and two quiet bedrooms.',
    imageFingerprints: ['fixture-fingerprint:property-bv-001:shared-01'],
  }),
  fixtureListing(BRISA_SANTANA, 'https://brisa.synthetic.invalid/listings/BRI-SN-001', {
    propertyType: 'apartment',
    askingPriceMinorUnits: 68_000_000,
    currency: 'BRL',
    areaSquareMeters: 74,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 1,
    features: ['elevator', 'playground'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Santana',
      street: 'Rua Cenário Três',
    },
    listedAt: '2025-07-22T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Brisa Synthetic Data Ltda.' },
    maskedDescription: 'Synthetic apartment with three bedrooms and shared leisure space.',
    imageFingerprints: ['fixture-fingerprint:property-sn-001:shared-01'],
  }),
  fixtureListing(BRISA_VILA_MARIANA, 'https://brisa.synthetic.invalid/listings/BRI-VM-001', {
    propertyType: 'house',
    askingPriceMinorUnits: 126_000_000,
    currency: 'BRL',
    areaSquareMeters: 135,
    bedrooms: 3,
    bathrooms: 3,
    parkingSpaces: 2,
    features: ['garden', 'solar-heating'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Vila Mariana',
      street: 'Rua Cenário Quatro',
    },
    listedAt: '2025-06-12T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Brisa Synthetic Data Ltda.' },
    maskedDescription: 'Synthetic house with garden and three bedrooms.',
    imageFingerprints: ['fixture-fingerprint:property-vm-001:shared-01'],
  }),
  fixtureListing(COBALTO_BELA_VISTA, 'https://cobalto.synthetic.invalid/listings/COB-BV-001', {
    propertyType: 'apartment',
    askingPriceMinorUnits: 82_500_000,
    currency: 'BRL',
    areaSquareMeters: 82,
    bedrooms: 2,
    bathrooms: 2,
    parkingSpaces: 1,
    features: ['balcony', 'elevator'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Vila Mariana',
      street: 'Rua Cenário Um',
    },
    listedAt: '2025-08-20T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Cobalto Synthetic Data Ltda.' },
    maskedDescription: 'Synthetic bright apartment with balcony near transit.',
    imageFingerprints: ['fixture-fingerprint:property-bv-001:shared-01'],
  }),
  fixtureListing(COBALTO_TATUAPE, 'https://cobalto.synthetic.invalid/listings/COB-TT-001', {
    propertyType: 'apartment',
    askingPriceMinorUnits: 95_000_000,
    currency: 'BRL',
    areaSquareMeters: 96,
    bedrooms: 3,
    bathrooms: 2,
    parkingSpaces: 2,
    features: ['balcony', 'pool'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Tatuapé',
      street: 'Rua Cenário Cinco',
    },
    listedAt: '2025-09-10T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Cobalto Synthetic Data Ltda.' },
    maskedDescription: 'Synthetic apartment with a pool and two parking spaces.',
    imageFingerprints: ['fixture-fingerprint:property-tt-001:own-01'],
  }),
  fixtureListing(COBALTO_VILA_MARIANA, 'https://cobalto.synthetic.invalid/listings/COB-VM-001', {
    propertyType: 'house',
    askingPriceMinorUnits: 124_000_000,
    currency: 'BRL',
    areaSquareMeters: 135,
    bedrooms: 3,
    bathrooms: 3,
    parkingSpaces: 2,
    features: ['garden', 'solar-heating'],
    location: {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Vila Mariana',
      street: 'Rua Cenário Quatro',
    },
    listedAt: '2025-06-15T12:00:00.000Z',
    advertiser: { type: 'agency', agencyName: 'Cobalto Synthetic Data Ltda.' },
    maskedDescription: 'Synthetic house with garden and solar heating.',
    imageFingerprints: ['fixture-fingerprint:property-vm-001:shared-01'],
  }),
] satisfies readonly SyntheticSaoPauloListing[]);

function property(
  propertyLabel: string,
  neighborhood: string,
  listingReferences: readonly SyntheticSaoPauloListingReference[],
): SyntheticSaoPauloProperty {
  return Object.freeze({
    propertyLabel,
    neighborhood,
    listingReferences: Object.freeze([...listingReferences]),
  });
}

const PROPERTIES = Object.freeze([
  property('property-bela-vista-001', 'Bela Vista', [
    AURORA_BELA_VISTA_1,
    BRISA_BELA_VISTA,
    COBALTO_BELA_VISTA,
  ]),
  property('property-pinheiros-001', 'Pinheiros', [AURORA_PINHEIROS]),
  property('property-santana-001', 'Santana', [AURORA_SANTANA, BRISA_SANTANA]),
  property('property-vila-mariana-001', 'Vila Mariana', [BRISA_VILA_MARIANA, COBALTO_VILA_MARIANA]),
  property('property-tatuape-001', 'Tatuapé', [COBALTO_TATUAPE]),
] satisfies readonly SyntheticSaoPauloProperty[]);

const RUN_DATES = Object.freeze([
  '2025-10-01T12:00:00.000Z',
  '2025-11-01T12:00:00.000Z',
  '2025-12-01T12:00:00.000Z',
  '2026-01-01T12:00:00.000Z',
  '2026-02-01T12:00:00.000Z',
  '2026-03-01T12:00:00.000Z',
  '2026-04-01T12:00:00.000Z',
  '2026-05-01T12:00:00.000Z',
  '2026-06-01T12:00:00.000Z',
  '2026-07-01T12:00:00.000Z',
  '2026-08-01T12:00:00.000Z',
  '2026-09-01T12:00:00.000Z',
  '2026-10-01T12:00:00.000Z',
] as const);

function listingForRun(base: SyntheticSaoPauloListing, runIndex: number): CollectedListing {
  const id = base.reference.sourceListingId;
  let askingPriceMinorUnits = base.listing.askingPriceMinorUnits;
  let maskedDescription = base.listing.maskedDescription;

  if (id === 'AUR-BV-001' && runIndex >= 3) askingPriceMinorUnits = 80_000_000;
  if (id === 'AUR-BV-001' && runIndex >= 9) askingPriceMinorUnits = 78_000_000;
  if (id === 'BRI-SN-001' && runIndex >= 4) askingPriceMinorUnits = 65_500_000;
  if (id === 'COB-TT-001' && runIndex >= 11) askingPriceMinorUnits = 92_000_000;

  if (id === 'BRI-BV-001' && runIndex >= 5) {
    maskedDescription = 'Synthetic apartment with a renovated living room and quiet bedrooms.';
  }
  if (id === 'COB-VM-001' && runIndex >= 10) {
    maskedDescription = 'Synthetic house with a refreshed garden and solar heating.';
  }
  if (id === 'AUR-PN-001' && runIndex >= 12) {
    maskedDescription = 'Synthetic apartment with a balcony and refreshed shared spaces.';
  }

  return frozenListing({ ...base.listing, askingPriceMinorUnits, maskedDescription });
}

function compareIdentities(
  left: Pick<SyntheticSaoPauloRunObservation, 'sourceId' | 'sourceListingId'>,
  right: Pick<SyntheticSaoPauloRunObservation, 'sourceId' | 'sourceListingId'>,
): number {
  if (left.sourceId < right.sourceId) return -1;
  if (left.sourceId > right.sourceId) return 1;
  if (left.sourceListingId < right.sourceListingId) return -1;
  if (left.sourceListingId > right.sourceListingId) return 1;
  return 0;
}

const RUNS = Object.freeze(
  RUN_DATES.map((observedAt, runIndex) => {
    const observations = LISTINGS.filter(
      ({ reference }) =>
        reference.sourceListingId !== 'COB-VM-001' || (runIndex !== 6 && runIndex !== 7),
    )
      .map((base) =>
        Object.freeze({
          sourceId: base.reference.sourceId,
          sourceListingId: base.reference.sourceListingId,
          sourceUrl: base.sourceUrl,
          observedAt,
          listing: listingForRun(base, runIndex),
        }),
      )
      .sort(compareIdentities);
    return Object.freeze({
      runKey: observedAt.slice(0, 7),
      observedAt,
      observations: Object.freeze(observations),
    });
  }),
);

export const SYNTHETIC_SAO_PAULO_DATASET: SyntheticSaoPauloDataset = Object.freeze({
  version: SYNTHETIC_SAO_PAULO_DATASET_VERSION,
  sources: SOURCES,
  places: PLACES,
  properties: PROPERTIES,
  listings: LISTINGS,
  runs: RUNS,
});
