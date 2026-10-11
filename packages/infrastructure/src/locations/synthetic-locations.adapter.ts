import type { LocationsFacade } from '@rei/application';
import {
  Place,
  parsePublishedAddress,
  normalizePlaceName,
  normalizeStreetName,
  selectUniqueBlock,
  type PublishedAddress,
} from '@rei/domain';
import type {
  CollectedListingLocation,
  ResolvedPropertyPlace,
  FixtureMetadata,
  PlaceDetail,
  PlaceRef,
  PlaceResponse,
  PlacesResponse,
} from '@rei/domain';
import {
  SYNTHETIC_SAO_PAULO_DATASET,
  SYNTHETIC_SAO_PAULO_DATASET_VERSION,
} from '../collection/index.js';

export const SYNTHETIC_READ_METADATA: FixtureMetadata = Object.freeze({
  dataMode: 'synthetic-stub',
  fixtureVersion: SYNTHETIC_SAO_PAULO_DATASET_VERSION,
  asOf: '2026-10-01T12:00:00.000Z',
});
export function placeSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(' ', '-');
}
function ref(id: string, kind: PlaceRef['kind'], en: string, ptBR = en): PlaceRef {
  return { id, kind, name: { en, ptBR } };
}
/** Registered fixture adjacency only; no geospatial inference. */
export function syntheticPlaces(): readonly PlaceDetail[] {
  const country = ref('brazil', 'country', 'Brazil', 'Brasil');
  const state = ref('sao-paulo-state', 'state', 'São Paulo state', 'Estado de São Paulo');
  const city = ref('sao-paulo', 'city', 'São Paulo');
  const zoneNames: Readonly<Record<string, string>> = {
    Centro: 'Central',
    Norte: 'North',
    Sul: 'South',
    Leste: 'East',
    Oeste: 'West',
  };
  const zones = ['Centro', 'Norte', 'Sul', 'Leste', 'Oeste'].map((name) =>
    ref(`sao-paulo-${placeSlug(name)}`, 'zone', `${zoneNames[name]} zone`, `Zona ${name}`),
  );
  const neighborhoods = SYNTHETIC_SAO_PAULO_DATASET.places.map((place) => ({
    ...ref(`sao-paulo-${placeSlug(place.neighborhood)}`, 'neighborhood', place.neighborhood),
    parentId: `sao-paulo-${placeSlug(place.zone)}`,
    zone: place.zone,
  }));
  const adjacency: Readonly<Record<string, readonly string[]>> = {
    'sao-paulo-bela-vista': ['sao-paulo-vila-mariana'],
    'sao-paulo-vila-mariana': ['sao-paulo-bela-vista'],
    'sao-paulo-santana': [],
    'sao-paulo-tatuape': [],
    'sao-paulo-pinheiros': [],
  };
  return [
    {
      ...country,
      parentId: null,
      breadcrumbs: [country],
      adjacentPlaceIds: [],
      propertyCount: 5,
      coordinates: null,
      block: null,
    },
    {
      ...state,
      parentId: country.id,
      breadcrumbs: [country, state],
      adjacentPlaceIds: [],
      propertyCount: 5,
      coordinates: null,
      block: null,
    },
    {
      ...city,
      parentId: state.id,
      breadcrumbs: [country, state, city],
      adjacentPlaceIds: [],
      propertyCount: 5,
      coordinates: null,
      block: null,
    },
    ...zones.map((zone) => ({
      ...zone,
      parentId: city.id,
      breadcrumbs: [country, state, city, zone],
      adjacentPlaceIds: [],
      coordinates: null,
      block: null,
      propertyCount: neighborhoods.filter((place) => place.parentId === zone.id).length,
    })),
    ...neighborhoods.map(({ zone, ...place }) => {
      const parent = zones.find((entry) => entry.id === `sao-paulo-${placeSlug(zone)}`)!;
      return {
        ...place,
        breadcrumbs: [
          country,
          state,
          city,
          parent,
          ref(place.id, place.kind, place.name.en, place.name.ptBR),
        ],
        adjacentPlaceIds: adjacency[place.id]!,
        coordinates: null,
        block: null,
        propertyCount: SYNTHETIC_SAO_PAULO_DATASET.properties.filter(
          (property) => property.neighborhood === place.name.ptBR,
        ).length,
      };
    }),
    ...SYNTHETIC_SAO_PAULO_DATASET.properties.map((property, index) => {
      const neighborhood = neighborhoods.find(
        (place) => place.name.ptBR === property.neighborhood,
      )!;
      const zone = zones.find((place) => place.id === neighborhood.parentId)!;
      const block = ref(
        syntheticBlockId(property.neighborhood),
        'street-block',
        `Fictional ${property.neighborhood} block`,
        `Quarteirão fictício ${property.neighborhood}`,
      );
      return {
        ...block,
        parentId: neighborhood.id,
        breadcrumbs: [
          country,
          state,
          city,
          zone,
          ref(neighborhood.id, neighborhood.kind, neighborhood.name.en, neighborhood.name.ptBR),
          block,
        ],
        adjacentPlaceIds: [],
        propertyCount: 1,
        coordinates: { latitude: -23.55 - index * 0.01, longitude: -46.63 + index * 0.01 },
        block: {
          streetName: SYNTHETIC_SAO_PAULO_DATASET.listings.find(
            (listing) => listing.reference === property.listingReferences[0],
          )!.listing.location.street,
          fromNumber: 100,
          toNumber: 199,
          origin: 'prepared-fixture' as const,
        },
      };
    }),
  ];
}
export function syntheticBlockId(neighborhood: string): string {
  return `sao-paulo-${placeSlug(neighborhood)}-fictional-block`;
}
export function syntheticPlace(id: string): PlaceDetail | null {
  return syntheticPlaces().find((place) => place.id === id) ?? null;
}
/** Supplementary fictional reference only; never part of the original prepared projection. */
export function supplementaryPlaces(): readonly PlaceDetail[] {
  return [
    [
      'sao-paulo-bela-vista',
      'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
      'Avenida Exemplo',
    ],
    [
      'sao-paulo-vila-mariana',
      'sao-paulo-vila-mariana-rua-cenario-um-fictional-block',
      'Rua Cenário Um',
    ],
  ].map(([parentId, id, street]) => {
    const parent = syntheticPlace(parentId!)!;
    const block = ref(
      id!,
      'street-block',
      street === 'Avenida Exemplo'
        ? 'Fictional Avenida Exemplo block'
        : 'Fictional Vila Mariana Rua Cenário Um block',
      street === 'Avenida Exemplo'
        ? 'Quarteirão fictício Avenida Exemplo'
        : 'Quarteirão fictício Vila Mariana Rua Cenário Um',
    );
    return {
      ...block,
      parentId: parent.id,
      breadcrumbs: [...parent.breadcrumbs, block],
      adjacentPlaceIds: [],
      propertyCount: 0,
      coordinates: null,
      block: {
        streetName: street!,
        fromNumber: 100,
        toNumber: 199,
        origin: 'prepared-fixture' as const,
      },
    };
  });
}
export function registeredSyntheticPlace(id: string): PlaceDetail | null {
  return syntheticPlace(id) ?? supplementaryPlaces().find((place) => place.id === id) ?? null;
}
export function placeContains(scope: string, neighborhood: string): boolean {
  return syntheticPlace(neighborhood)?.breadcrumbs.some((place) => place.id === scope) ?? false;
}
export class SyntheticLocationsAdapter implements LocationsFacade {
  public async registeredScopeIds(id: string): Promise<readonly string[] | null> {
    const places = [...syntheticPlaces(), ...supplementaryPlaces()];
    if (!places.some((place) => place.id === id)) return null;
    return places
      .filter((place) => place.breadcrumbs.some((crumb) => crumb.id === id))
      .map((place) => place.id)
      .sort();
  }
  public async resolvePublishedAddress(
    input: PublishedAddress,
  ): Promise<ResolvedPropertyPlace | null> {
    const address = parsePublishedAddress(input);
    const candidates =
      address.city === 'sao paulo' && address.stateCode === 'sp'
        ? [...syntheticPlaces(), ...supplementaryPlaces()]
            .filter(
              (place) =>
                place.block &&
                normalizeStreetName(place.block.streetName) === address.street &&
                place.breadcrumbs.some(
                  (crumb) =>
                    crumb.kind === 'neighborhood' &&
                    normalizePlaceName(crumb.name.ptBR) === address.neighborhood,
                ),
            )
            .map((place) => new Place(place))
        : [];
    const place = selectUniqueBlock(candidates, address.number)?.detail;
    return place
      ? structuredClone({
          place: { id: place.id, kind: place.kind, name: place.name },
          breadcrumbs: place.breadcrumbs,
        })
      : null;
  }
  public async resolveFixtureAddress(
    address: CollectedListingLocation,
  ): Promise<ResolvedPropertyPlace | null> {
    if (address.city !== 'São Paulo' || address.stateCode !== 'SP') return null;
    const places = syntheticPlaces();
    const block = places.find(
      (entry) =>
        entry.kind === 'street-block' &&
        entry.block?.streetName === address.street &&
        entry.breadcrumbs.some(
          (crumb) => crumb.kind === 'neighborhood' && crumb.name.ptBR === address.neighborhood,
        ),
    );
    const knownNeighborhood =
      address.street === 'Avenida Exemplo' && address.neighborhood === 'Bela Vista'
        ? places.find((entry) => entry.id === 'sao-paulo-bela-vista')
        : null;
    const resolved = block ?? knownNeighborhood;
    if (!resolved) return null;
    const { id, kind, name, breadcrumbs } = resolved;
    return structuredClone({ place: { id, kind, name }, breadcrumbs });
  }
  public async roots(): Promise<PlacesResponse> {
    return structuredClone({
      metadata: SYNTHETIC_READ_METADATA,
      items: syntheticPlaces().filter((place) => place.parentId === null),
    });
  }
  public async getPlace(id: string): Promise<PlaceResponse | null> {
    const place = syntheticPlace(id);
    return place === null ? null : structuredClone({ metadata: SYNTHETIC_READ_METADATA, place });
  }
  public async children(id: string): Promise<PlacesResponse | null> {
    return syntheticPlace(id) === null
      ? null
      : structuredClone({
          metadata: SYNTHETIC_READ_METADATA,
          items: syntheticPlaces().filter((place) => place.parentId === id),
        });
  }
}
