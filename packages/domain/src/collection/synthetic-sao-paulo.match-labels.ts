export type SyntheticSaoPauloListingReference = Readonly<{
  readonly sourceId: string;
  readonly sourceListingId: string;
  readonly propertyLabel: string;
}>;

export type SyntheticSaoPauloMatchLabel = Readonly<{
  readonly left: SyntheticSaoPauloListingReference;
  readonly right: SyntheticSaoPauloListingReference;
  readonly sameProperty: boolean;
}>;

function reference(
  sourceId: string,
  sourceListingId: string,
  propertyLabel: string,
): SyntheticSaoPauloListingReference {
  return Object.freeze({ sourceId, sourceListingId, propertyLabel });
}

const AURORA_BELA_VISTA_1 = reference(
  'synthetic-portal-aurora',
  'AUR-BV-001',
  'property-bela-vista-001',
);
const AURORA_PINHEIROS = reference(
  'synthetic-portal-aurora',
  'AUR-PN-001',
  'property-pinheiros-001',
);
const AURORA_SANTANA = reference('synthetic-portal-aurora', 'AUR-SN-001', 'property-santana-001');
const BRISA_BELA_VISTA = reference(
  'synthetic-portal-brisa',
  'BRI-BV-001',
  'property-bela-vista-001',
);
const BRISA_SANTANA = reference('synthetic-portal-brisa', 'BRI-SN-001', 'property-santana-001');
const BRISA_VILA_MARIANA = reference(
  'synthetic-portal-brisa',
  'BRI-VM-001',
  'property-vila-mariana-001',
);
const COBALTO_BELA_VISTA = reference(
  'synthetic-portal-cobalto',
  'COB-BV-001',
  'property-bela-vista-001',
);
const COBALTO_TATUAPE = reference('synthetic-portal-cobalto', 'COB-TT-001', 'property-tatuape-001');
const COBALTO_VILA_MARIANA = reference(
  'synthetic-portal-cobalto',
  'COB-VM-001',
  'property-vila-mariana-001',
);

export const SYNTHETIC_SAO_PAULO_LISTING_REFERENCES = Object.freeze([
  AURORA_BELA_VISTA_1,
  AURORA_PINHEIROS,
  AURORA_SANTANA,
  BRISA_BELA_VISTA,
  BRISA_SANTANA,
  BRISA_VILA_MARIANA,
  COBALTO_BELA_VISTA,
  COBALTO_TATUAPE,
  COBALTO_VILA_MARIANA,
] as const satisfies readonly SyntheticSaoPauloListingReference[]);

function match(
  left: SyntheticSaoPauloListingReference,
  right: SyntheticSaoPauloListingReference,
  sameProperty: boolean,
): SyntheticSaoPauloMatchLabel {
  return Object.freeze({ left, right, sameProperty });
}

/** Exhaustive ground truth for all 36 unordered pairs of the nine stable identities. */
export const SYNTHETIC_SAO_PAULO_MATCH_LABELS = Object.freeze([
  match(AURORA_BELA_VISTA_1, AURORA_PINHEIROS, false),
  match(AURORA_BELA_VISTA_1, AURORA_SANTANA, false),
  match(AURORA_BELA_VISTA_1, BRISA_BELA_VISTA, true),
  match(AURORA_BELA_VISTA_1, BRISA_SANTANA, false),
  match(AURORA_BELA_VISTA_1, BRISA_VILA_MARIANA, false),
  match(AURORA_BELA_VISTA_1, COBALTO_BELA_VISTA, true),
  match(AURORA_BELA_VISTA_1, COBALTO_TATUAPE, false),
  match(AURORA_BELA_VISTA_1, COBALTO_VILA_MARIANA, false),
  match(AURORA_PINHEIROS, AURORA_SANTANA, false),
  match(AURORA_PINHEIROS, BRISA_BELA_VISTA, false),
  match(AURORA_PINHEIROS, BRISA_SANTANA, false),
  match(AURORA_PINHEIROS, BRISA_VILA_MARIANA, false),
  match(AURORA_PINHEIROS, COBALTO_BELA_VISTA, false),
  match(AURORA_PINHEIROS, COBALTO_TATUAPE, false),
  match(AURORA_PINHEIROS, COBALTO_VILA_MARIANA, false),
  match(AURORA_SANTANA, BRISA_BELA_VISTA, false),
  match(AURORA_SANTANA, BRISA_SANTANA, true),
  match(AURORA_SANTANA, BRISA_VILA_MARIANA, false),
  match(AURORA_SANTANA, COBALTO_BELA_VISTA, false),
  match(AURORA_SANTANA, COBALTO_TATUAPE, false),
  match(AURORA_SANTANA, COBALTO_VILA_MARIANA, false),
  match(BRISA_BELA_VISTA, BRISA_SANTANA, false),
  match(BRISA_BELA_VISTA, BRISA_VILA_MARIANA, false),
  match(BRISA_BELA_VISTA, COBALTO_BELA_VISTA, true),
  match(BRISA_BELA_VISTA, COBALTO_TATUAPE, false),
  match(BRISA_BELA_VISTA, COBALTO_VILA_MARIANA, false),
  match(BRISA_SANTANA, BRISA_VILA_MARIANA, false),
  match(BRISA_SANTANA, COBALTO_BELA_VISTA, false),
  match(BRISA_SANTANA, COBALTO_TATUAPE, false),
  match(BRISA_SANTANA, COBALTO_VILA_MARIANA, false),
  match(BRISA_VILA_MARIANA, COBALTO_BELA_VISTA, false),
  match(BRISA_VILA_MARIANA, COBALTO_TATUAPE, false),
  match(BRISA_VILA_MARIANA, COBALTO_VILA_MARIANA, true),
  match(COBALTO_BELA_VISTA, COBALTO_TATUAPE, false),
  match(COBALTO_BELA_VISTA, COBALTO_VILA_MARIANA, false),
  match(COBALTO_TATUAPE, COBALTO_VILA_MARIANA, false),
] as const satisfies readonly SyntheticSaoPauloMatchLabel[]);
