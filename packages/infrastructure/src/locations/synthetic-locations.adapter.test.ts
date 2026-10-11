import { describe, expect, it } from 'vitest';
import {
  placeContains,
  SyntheticLocationsAdapter,
  supplementaryPlaces,
  registeredSyntheticPlace,
  syntheticPlaces,
} from './synthetic-locations.adapter.js';
describe('synthetic locations read facade', () => {
  const adapter = new SyntheticLocationsAdapter();
  it('returns detached registered self/descendant scope IDs at every level including supplementary blocks', async () => {
    const places = [...syntheticPlaces(), ...supplementaryPlaces()];
    for (const place of places) {
      const expected = places
        .filter((item) => item.breadcrumbs.some((crumb) => crumb.id === place.id))
        .map((item) => item.id)
        .sort();
      const ids = await adapter.registeredScopeIds(place.id);
      expect(ids).toEqual(expected);
      Reflect.set(ids!, '0', 'changed');
      expect(await adapter.registeredScopeIds(place.id)).toEqual(expected);
    }
    expect(await adapter.registeredScopeIds('unknown')).toBeNull();
  });
  it('exposes city, five zones, bilingual crumbs, counts and registered symmetric adjacency', async () => {
    const roots = await adapter.roots();
    expect(roots.items[0]!.id).toBe('brazil');
    expect((await adapter.children('brazil'))!.items[0]!.id).toBe('sao-paulo-state');
    expect((await adapter.children('sao-paulo-state'))!.items[0]!.id).toBe('sao-paulo');
    expect(roots.items[0]!.propertyCount).toBe(5);
    const zones = (await adapter.children('sao-paulo'))!;
    expect(zones.items).toHaveLength(5);
    for (const zone of zones.items) {
      const children = (await adapter.children(zone.id))!;
      expect(children.items).toHaveLength(1);
      expect(children.items[0]!.breadcrumbs.map((place) => place.id)).toEqual([
        'brazil',
        'sao-paulo-state',
        'sao-paulo',
        zone.id,
        children.items[0]!.id,
      ]);
      expect(children.items[0]!.name.ptBR).toBeTruthy();
      const block = (await adapter.children(children.items[0]!.id))!.items[0]!;
      expect(block.kind).toBe('street-block');
      expect(block.breadcrumbs.map((crumb) => crumb.kind)).toEqual([
        'country',
        'state',
        'city',
        'zone',
        'neighborhood',
        'street-block',
      ]);
      expect(block.block?.origin).toBe('prepared-fixture');
      expect(block.block!.fromNumber).toBeLessThanOrEqual(block.block!.toNumber);
      expect(block.coordinates?.latitude).toBeTypeOf('number');
      expect(block.propertyCount).toBe(1);
      for (const ancestor of block.breadcrumbs)
        expect(placeContains(ancestor.id, block.id)).toBe(true);
    }
    const belaVista = (await adapter.getPlace('sao-paulo-bela-vista'))!.place;
    expect(belaVista.adjacentPlaceIds).toEqual(['sao-paulo-vila-mariana']);
    expect(
      (await adapter.getPlace(belaVista.adjacentPlaceIds[0]!))!.place.adjacentPlaceIds,
    ).toContain(belaVista.id);
    expect(syntheticPlaces()).toHaveLength(18);
  });
  it('returns empty leaves, missing resources and fresh nested state', async () => {
    expect((await adapter.children('sao-paulo-bela-vista-fictional-block'))!.items).toEqual([]);
    expect(await adapter.getPlace('unknown')).toBeNull();
    expect(await adapter.children('unknown')).toBeNull();
    expect(placeContains('unknown', 'unknown')).toBe(false);
    expect(placeContains('sao-paulo-sul', 'sao-paulo-bela-vista')).toBe(false);
    const first = (await adapter.getPlace('sao-paulo'))!;
    Reflect.set(first.place.name, 'en', 'MUTATED');
    expect((await adapter.getPlace('sao-paulo'))!.place.name.en).toBe('São Paulo');
  });
  it('keeps original prepared eighteen separate from detached supplementary references', async () => {
    const blocks = supplementaryPlaces();
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.propertyCount).toBe(0);
      expect(block.coordinates).toBeNull();
      expect(block.breadcrumbs).toHaveLength(6);
      expect(registeredSyntheticPlace(block.id)).toEqual(block);
      expect(syntheticPlaces().some((place) => place.id === block.id)).toBe(false);
    }
    Reflect.set(blocks[0]!.name, 'en', 'Changed');
    expect(supplementaryPlaces()[0]!.name.en).not.toBe('Changed');
    expect(registeredSyntheticPlace('unknown')).toBeNull();
  });
  it('resolves published block aliases while retaining the historical fixture resolver', async () => {
    const address = {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Avenida Exemplo',
    };
    expect((await adapter.resolveFixtureAddress(address))!.breadcrumbs).toHaveLength(5);
    expect(
      (await adapter.resolvePublishedAddress({ ...address, street: 'av.  Exemplo', number: 100 }))!
        .place.id,
    ).toBe('sao-paulo-bela-vista-avenida-exemplo-fictional-block');
    expect(await adapter.resolvePublishedAddress({ ...address, number: 200 })).toBeNull();
    expect(await adapter.resolvePublishedAddress({ ...address, street: 'Unknown' })).toBeNull();
    expect(await adapter.resolvePublishedAddress({ ...address, city: 'Unknown' })).toBeNull();
    expect(await adapter.resolvePublishedAddress({ ...address, stateCode: 'RJ' })).toBeNull();
    await expect(adapter.resolvePublishedAddress({ ...address, number: 1.1 })).rejects.toThrow();
  });
});
