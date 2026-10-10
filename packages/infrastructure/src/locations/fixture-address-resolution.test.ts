import { describe, expect, it } from 'vitest';
import { SyntheticLocationsAdapter } from './synthetic-locations.adapter.js';

describe('fixture-only address resolution', () => {
  const adapter = new SyntheticLocationsAdapter();
  const address = {
    city: 'São Paulo',
    stateCode: 'SP',
    neighborhood: 'Bela Vista',
    street: 'Avenida Exemplo',
  };
  it('uses the known neighborhood for Avenida Exemplo and exact prepared block for its actual street', async () => {
    expect((await adapter.resolveFixtureAddress(address))!.place.id).toBe('sao-paulo-bela-vista');
    const block = await adapter.resolveFixtureAddress({ ...address, street: 'Rua Cenário Um' });
    expect(block!.place.id).toBe('sao-paulo-bela-vista-fictional-block');
    expect(block!.breadcrumbs).toHaveLength(6);
  });
  it.each([
    { ...address, street: 'Unknown' },
    { ...address, neighborhood: 'Unknown' },
    { ...address, city: 'Other' },
    { ...address, stateCode: 'RJ' },
  ])('never guesses an unknown address %j', async (unknown) => {
    expect(await adapter.resolveFixtureAddress(unknown)).toBeNull();
  });
});
