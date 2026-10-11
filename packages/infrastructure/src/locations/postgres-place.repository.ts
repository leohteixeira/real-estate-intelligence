import type { PlaceRepository, Transaction } from '@rei/application';
import { Place, type FixtureMetadata, type PlaceDetail, type PublishedAddress } from '@rei/domain';
import type { DatabaseConnection } from '../shared/index.js';
import { redactConnectionError } from '../shared/index.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

/** All hierarchy/adjacency SQL stays in the owned Locations schema. */
export class PostgresPlaceRepository implements PlaceRepository {
  public constructor(private readonly database: DatabaseConnection) {}
  public async registeredScopeIds(id: string): Promise<readonly string[] | null> {
    const rows = await this.database.query<{ id: string }>(
      `WITH RECURSIVE scope AS (
        SELECT place_id,public_id FROM locations.place WHERE public_id=$1
        UNION ALL
        SELECT child.place_id,child.public_id FROM locations.place child JOIN scope ON child.parent_id=scope.place_id
      ) SELECT public_id AS id FROM scope ORDER BY public_id`,
      [id],
    );
    return rows.length ? rows.map((row) => row.id) : null;
  }
  public async metadata(): Promise<FixtureMetadata> {
    const rows = await this.database.query<FixtureMetadata>(
      `SELECT data_mode AS "dataMode", fixture_version AS "fixtureVersion", to_char(as_of AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOf" FROM locations.reference_metadata WHERE singleton = true`,
    );
    if (rows.length !== 1) throw new Error('Locations reference metadata is unavailable.');
    return { ...rows[0]! };
  }
  public roots(): Promise<readonly Place[]> {
    return this.read('p.parent_id IS NULL');
  }
  public async findById(id: string): Promise<Place | null> {
    return (await this.read('p.public_id = $1', [id]))[0] ?? null;
  }
  public children(id: string): Promise<readonly Place[]> {
    return this.read('p.parent_id = (SELECT place_id FROM locations.place WHERE public_id = $1)', [
      id,
    ]);
  }
  public addressCandidates(
    address: PublishedAddress,
    transaction?: Transaction,
  ): Promise<readonly Place[]> {
    return this.read(
      `p.kind = 'street-block' AND p.normalized_street = $1
      AND EXISTS (SELECT 1 FROM locations.place neighborhood
        JOIN locations.place zone ON zone.place_id = neighborhood.parent_id
        JOIN locations.place city ON city.place_id = zone.parent_id
        JOIN locations.place state ON state.place_id = city.parent_id
        WHERE neighborhood.place_id = p.parent_id AND neighborhood.normalized_name = $2
          AND city.normalized_name = $3 AND state.state_code = $4)`,
      [address.street, address.neighborhood, address.city, address.stateCode],
      transaction,
    );
  }
  private async read(
    predicate: string,
    parameters: readonly unknown[] = [],
    transaction?: Transaction,
  ): Promise<readonly Place[]> {
    const query = transaction ? postgresClientFor(transaction, this.database) : this.database;
    let rows: readonly { detail: PlaceDetail }[];
    try {
      rows = await query.query<{ detail: PlaceDetail }>(
        `
      WITH RECURSIVE selected AS (SELECT p.* FROM locations.place p WHERE ${predicate}),
      ancestors AS (
        SELECT p.place_id AS target_id, p.place_id, p.parent_id, p.public_id, p.kind, p.name_en, p.name_pt_br, 0 AS depth FROM selected p
        UNION ALL
        SELECT a.target_id, p.place_id, p.parent_id, p.public_id, p.kind, p.name_en, p.name_pt_br, a.depth + 1
        FROM ancestors a JOIN locations.place p ON p.place_id = a.parent_id
      )
      SELECT jsonb_build_object(
        'id', p.public_id, 'kind', p.kind, 'name', jsonb_build_object('en',p.name_en,'ptBR',p.name_pt_br),
        'parentId',parent.public_id,
        'breadcrumbs',(SELECT jsonb_agg(jsonb_build_object('id',a.public_id,'kind',a.kind,'name',jsonb_build_object('en',a.name_en,'ptBR',a.name_pt_br)) ORDER BY a.depth DESC) FROM ancestors a WHERE a.target_id=p.place_id),
        'adjacentPlaceIds',COALESCE((SELECT jsonb_agg(neighbor.public_id ORDER BY neighbor.sibling_order,neighbor.public_id)
          FROM locations.neighborhood_adjacency edge JOIN locations.place neighbor
          ON neighbor.place_id = CASE WHEN edge.first_id=p.place_id THEN edge.second_id ELSE edge.first_id END
          WHERE edge.first_id=p.place_id OR edge.second_id=p.place_id),'[]'::jsonb),
        'propertyCount',p.prepared_property_count,
        'coordinates',CASE WHEN p.latitude IS NULL THEN NULL ELSE jsonb_build_object('latitude',p.latitude,'longitude',p.longitude) END,
        'block',CASE WHEN p.kind <> 'street-block' THEN NULL ELSE jsonb_build_object('streetName',p.street_name,'fromNumber',p.from_number,'toNumber',p.to_number,'origin',p.block_origin) END
      ) AS detail FROM selected p LEFT JOIN locations.place parent ON parent.place_id=p.parent_id
      ORDER BY p.sibling_order,p.public_id`,
        parameters,
      );
    } catch (error) {
      throw redactConnectionError(error);
    }
    return rows.map((row) => new Place(row.detail));
  }
}
