import { describe, expect, it, vi } from 'vitest';
import {
  Place,
  normalizePlaceName,
  normalizeStreetName,
  type PlaceDetail,
  type PlaceRef,
} from '@rei/domain';
import type { PlaceRepository } from './place.repository.js';
import { LocationsQueryService } from './locations-query.service.js';

const metadata = {
  dataMode: 'synthetic-stub' as const,
  fixtureVersion: 'synthetic-sao-paulo-v1',
  asOf: '2026-10-01T12:00:00.000Z',
};
const rows = [
  ['Bela Vista', 'Centro', 'Rua Cenário Um', 'sao-paulo-bela-vista-fictional-block'],
  ['Pinheiros', 'Oeste', 'Rua Cenário Seis', 'sao-paulo-pinheiros-fictional-block'],
  ['Santana', 'Norte', 'Rua Cenário Três', 'sao-paulo-santana-fictional-block'],
  ['Vila Mariana', 'Sul', 'Rua Cenário Quatro', 'sao-paulo-vila-mariana-fictional-block'],
  ['Tatuapé', 'Leste', 'Rua Cenário Cinco', 'sao-paulo-tatuape-fictional-block'],
  [
    'Vila Mariana',
    'Sul',
    'Rua Cenário Um',
    'sao-paulo-vila-mariana-rua-cenario-um-fictional-block',
  ],
  [
    'Bela Vista',
    'Centro',
    'Avenida Exemplo',
    'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
  ],
] as const;
function block(row: (typeof rows)[number]): Place {
  const [neighborhood, zone, street, id] = row;
  const crumbs = (
    [
      ['brazil', 'country', 'Brasil'],
      ['sao-paulo-state', 'state', 'Estado de São Paulo'],
      ['sao-paulo', 'city', 'São Paulo'],
      [`sao-paulo-${normalizePlaceName(zone)}`, 'zone', zone],
      [
        `sao-paulo-${normalizePlaceName(neighborhood).replaceAll(' ', '-')}`,
        'neighborhood',
        neighborhood,
      ],
      [id, 'street-block', street],
    ] as const
  ).map(([id, kind, name]) => ({ id, kind, name: { en: name, ptBR: name } }));
  return new Place({
    ...crumbs[5]!,
    parentId: crumbs[4]!.id,
    breadcrumbs: crumbs,
    adjacentPlaceIds: [],
    propertyCount: 0,
    coordinates: null,
    block: { streetName: street, fromNumber: 100, toNumber: 199, origin: 'prepared-fixture' },
  });
}
function fixture() {
  let candidates = rows.map(block);
  const root = new Place({
    id: 'brazil',
    kind: 'country',
    name: { en: 'Brazil', ptBR: 'Brasil' },
    parentId: null,
    breadcrumbs: [{ id: 'brazil', kind: 'country', name: { en: 'Brazil', ptBR: 'Brasil' } }],
    adjacentPlaceIds: [],
    propertyCount: 5,
    coordinates: null,
    block: null,
  });
  const repository: PlaceRepository = {
    registeredScopeIds: vi.fn(async (id) =>
      id === 'brazil'
        ? ['brazil', ...candidates.map((place) => place.detail.id)]
        : candidates.some((place) => place.detail.id === id)
          ? [id]
          : null,
    ),
    metadata: vi.fn(async () => metadata),
    roots: vi.fn(async () => [root]),
    findById: vi.fn(
      async (id) => [root, ...candidates].find((place) => place.detail.id === id) ?? null,
    ),
    children: vi.fn(async (id) => candidates.filter((place) => place.detail.parentId === id)),
    addressCandidates: vi.fn(async (address) =>
      address.city === 'sao paulo' && address.stateCode === 'sp'
        ? candidates.filter(
            (place) =>
              normalizeStreetName(place.detail.block!.streetName) === address.street &&
              normalizePlaceName(place.detail.breadcrumbs[4]!.name.ptBR) === address.neighborhood,
          )
        : [],
    ),
  };
  return {
    repository,
    service: new LocationsQueryService(repository),
    replace: (values: Place[]) => {
      candidates = values;
    },
  };
}
describe('Locations queries through the read port', () => {
  it('delegates registered scope without count/detail hydration and detaches it', async () => {
    const f = fixture();
    const scope = (await f.service.registeredScopeIds('brazil'))!;
    expect(scope).toContain(rows[6][3]);
    expect(await f.service.registeredScopeIds(rows[6][3])).toEqual([rows[6][3]]);
    expect(await f.service.registeredScopeIds('unknown')).toBeNull();
    expect(f.repository.findById).not.toHaveBeenCalled();
    scope.pop();
    expect((await f.service.registeredScopeIds('brazil'))!).toHaveLength(8);
    await expect(f.service.registeredScopeIds('BAD')).rejects.toThrow('Invalid place');
    vi.mocked(f.repository.registeredScopeIds).mockRejectedValueOnce(new Error('Unavailable'));
    await expect(f.service.registeredScopeIds('brazil')).rejects.toThrow('Unavailable');
  });
  const published = [
    rows[0],
    rows[1],
    rows[2],
    rows[0],
    rows[2],
    rows[3],
    rows[5],
    rows[4],
    rows[3],
    rows[6],
  ];
  it.each(published)(
    'resolves canonical published %s / %s / %s independently of matching labels',
    async (neighborhood, zone, street, id) => {
      const { service } = fixture();
      const resolved = await service.resolvePublishedAddress({
        city: 'São Paulo',
        stateCode: 'SP',
        neighborhood,
        street,
      });
      expect(resolved!.place.id).toBe(id);
      expect(resolved!.breadcrumbs).toHaveLength(6);
      expect(resolved!.breadcrumbs[3]!.name.ptBR).toBe(zone);
    },
  );
  it('normalizes aliases and inclusive optional numbers without guessing', async () => {
    const { service } = fixture();
    const input = {
      city: ' SAO  PAULO ',
      stateCode: 'sp',
      neighborhood: 'BÉLA VISTA',
      street: 'av. exemplo',
    };
    for (const number of [undefined, 100, 199])
      expect(
        (await service.resolvePublishedAddress({
          ...input,
          ...(number === undefined ? {} : { number }),
        }))!.place.id,
      ).toBe(rows[6][3]);
    for (const number of [0, 99, 200, Number.MAX_SAFE_INTEGER])
      expect(await service.resolvePublishedAddress({ ...input, number })).toBeNull();
    for (const change of [
      { city: 'Other' },
      { stateCode: 'RJ' },
      { neighborhood: 'Bela' },
      { street: 'Exemplo' },
    ])
      expect(await service.resolvePublishedAddress({ ...input, ...change })).toBeNull();
  });
  it('refuses no-number and overlapping-range ambiguity', async () => {
    const f = fixture();
    const first = block(rows[6]);
    const detail = first.detail;
    const own: PlaceRef = {
      id: 'another-block',
      kind: 'street-block',
      name: { en: 'Another', ptBR: 'Outro' },
    };
    const secondDetail: PlaceDetail = {
      ...detail,
      ...own,
      breadcrumbs: [...detail.breadcrumbs.slice(0, 5), own],
      block: { ...detail.block!, fromNumber: 200, toNumber: 299 },
    };
    f.replace([first, new Place(secondDetail)]);
    const input = {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Avenida Exemplo',
    };
    expect(await f.service.resolvePublishedAddress(input)).toBeNull();
    expect((await f.service.resolvePublishedAddress({ ...input, number: 200 }))!.place.id).toBe(
      'another-block',
    );
    f.replace([first, new Place({ ...secondDetail, block: detail.block })]);
    expect(await f.service.resolvePublishedAddress({ ...input, number: 100 })).toBeNull();
  });
  it('validates before any I/O and propagates failures', async () => {
    const { service, repository } = fixture();
    await expect(
      service.resolvePublishedAddress({
        city: 'São Paulo',
        stateCode: 'SP',
        neighborhood: 'Bela Vista',
        street: 'Rua Um',
        complement: 'private',
      } as never),
    ).rejects.toThrow('Invalid published');
    expect(repository.addressCandidates).not.toHaveBeenCalled();
    for (const method of [service.getPlace.bind(service), service.children.bind(service)])
      await expect(method('BAD')).rejects.toThrow('Invalid place');
    expect(repository.findById).not.toHaveBeenCalled();
    vi.mocked(repository.roots).mockRejectedValueOnce(new Error('Unavailable'));
    await expect(service.roots()).rejects.toThrow('Unavailable');
  });
  it('returns roots, leaves, missing values and detached canonical outputs', async () => {
    const { service, repository } = fixture();
    expect((await service.roots()).items[0]!.propertyCount).toBe(5);
    const place = (await service.getPlace(rows[6][3]))!;
    expect(place.place.coordinates).toBeNull();
    expect((await service.children(rows[6][3]))!.items).toEqual([]);
    expect(await service.getPlace('unknown')).toBeNull();
    expect(await service.children('unknown')).toBeNull();
    expect(repository.children).toHaveBeenCalledTimes(1);
    Reflect.set(place.place.name, 'en', 'Changed');
    expect((await service.getPlace(rows[6][3]))!.place.name.en).not.toBe('Changed');
  });
});
