import { createHash } from 'node:crypto';
import type {
  PropertyResolutionRepository,
  Transaction,
  OutboxAppendPort,
  UuidV7Generator,
  EventEnvelope,
} from '@rei/application';
import {
  NormalizedListing,
  PropertyMatchQueuedForReview,
  PropertiesEventV2,
  parsePropertiesEvent,
  isSerializableEventPayload,
  type PropertiesEvent,
  type ResolutionInput,
  type ResolutionConfiguration,
  type ResolutionComparison,
  type ResolutionGroup,
  normalizePlaceName,
  normalizeStreetName,
  type ListingChronologyState,
  type ListingFact,
  type MinimumAskingPriceFact,
  type CausalListingState,
} from '@rei/domain';
import type {
  DatabaseClient,
  DatabaseConnection,
} from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { lockPropertyResolution } from './property-resolution-guard.js';

type RetainedListingEvent = PropertiesEvent<
  | 'properties.listing.created'
  | 'properties.listing.price-changed'
  | 'properties.listing.description-changed'
  | 'properties.listing.removed'
  | 'properties.listing.reappeared'
>;

interface Assignment {
  listing_id: string;
  property_id: string;
  assignment_revision: number;
  processed_revision: number;
  market_fact: ListingFact;
  input_event_id: string;
  input_hash: string;
}
type SaveInput = {
  readonly inputs: readonly ResolutionInput[];
  readonly comparisons: readonly ResolutionComparison[];
  readonly groups: readonly ResolutionGroup[];
  readonly configuration: ResolutionConfiguration;
};
/** A guarded scan is deliberately bounded and atomic; a failed/cancelled cycle is recovered by the next scan. */
export class PostgresPropertyResolutionRepository implements PropertyResolutionRepository {
  public constructor(
    private readonly connection: DatabaseConnection,
    private readonly outbox: OutboxAppendPort,
    private readonly identifiers: UuidV7Generator,
  ) {}
  public async load(
    transaction: Transaction,
    maximumListings: number,
  ): Promise<readonly ResolutionInput[]> {
    await lockPropertyResolution(transaction, this.connection);
    const rows = await postgresClientFor(transaction, this.connection).query<{
      listing_id: string;
      property_id: string;
      event: unknown;
      state: ListingChronologyState | null;
      continuity_group_id: string | null;
      stored_input_hash: string | null;
    }>(
      `SELECT listing.listing_id::text,listing.property_id::text,fact.event,current.state,CASE WHEN assignment.suppression_continuity_hash IS NOT NULL THEN assignment.property_id::text ELSE NULL END AS continuity_group_id,assignment.suppression_continuity_hash AS stored_input_hash
       FROM properties.listing listing JOIN properties.property property ON property.property_id=listing.property_id
       JOIN properties.incoming_fact fact ON fact.event_id=property.initial_event_id
       LEFT JOIN properties.listing_current current ON current.listing_id=listing.listing_id
       LEFT JOIN properties.listing_assignment assignment ON assignment.listing_id=listing.listing_id
       WHERE EXISTS (SELECT 1 FROM properties.listing_event retained WHERE retained.listing_id=listing.listing_id)
          OR EXISTS (SELECT 1 FROM properties.listing_assignment assigned WHERE assigned.listing_id=listing.listing_id)
       ORDER BY listing.listing_id LIMIT $1`,
      [maximumListings + 1],
    );
    if (rows.length > maximumListings)
      throw new RangeError(
        'Entity resolution listing bound exceeded; no partial groups were written.',
      );
    // Legacy identities without any retained authentic market envelope remain unresolved.
    // Already assigned identities stay in the scan and fail below if their causal facts disappear.
    const inputs = rows.map((row) => {
      const acquisition = row.state?.acquisitions.at(-1);
      const listing = new NormalizedListing(
        acquisition ? (acquisition.corrected ?? acquisition.original) : row.event,
      );
      const original = parseCollectionInput(
        acquisition ? (acquisition.corrected ?? acquisition.original) : row.event,
      );
      return {
        listingId: row.listing_id,
        originalPropertyId: row.property_id,
        inputEventId: original.eventId,
        inputHash: matchingHash(listing),
        listing,
      };
    });
    const changed = new Set(
      rows
        .filter(
          (row, index) =>
            row.continuity_group_id && row.stored_input_hash !== inputs[index]!.inputHash,
        )
        .map((row) => row.continuity_group_id),
    );
    return inputs.map((input, index) =>
      rows[index]!.continuity_group_id && !changed.has(rows[index]!.continuity_group_id)
        ? { ...input, continuityGroupId: rows[index]!.continuity_group_id! }
        : input,
    );
  }
  public async save(
    transaction: Transaction,
    input: SaveInput,
    signal: AbortSignal,
  ): Promise<number> {
    const client = postgresClientFor(transaction, this.connection);
    const { configuration } = input;
    await client.query(
      `INSERT INTO properties.resolution_configuration (configuration_id,version,configuration) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING`,
      [configuration.id, configuration.version, JSON.stringify(configuration)],
    );
    const stored = await client.query<{ configuration: ResolutionConfiguration }>(
      'SELECT configuration FROM properties.resolution_configuration WHERE configuration_id=$1 AND version=$2',
      [configuration.id, configuration.version],
    );
    const canonical = (value: ResolutionConfiguration) =>
      JSON.stringify([
        value.id,
        value.version,
        value.probabilityBasis,
        ['coordinates', 'images', 'area', 'bedrooms', 'description'].map(
          (key) => value.weights[key as keyof typeof value.weights],
        ),
      ]);
    if (!stored[0] || canonical(stored[0].configuration) !== canonical(configuration))
      throw new Error('Resolution configuration identity cannot be reused with different values.');
    const rows = await client.query<Assignment>(
      'SELECT listing_id::text,property_id::text,assignment_revision,processed_revision,market_fact,input_event_id::text,input_hash FROM properties.listing_assignment ORDER BY listing_id',
    );
    const assignments = new Map(rows.map((row) => [row.listing_id, { ...row }]));
    const published: EventEnvelope[] = [];
    const listingRows = await client.query<{ event: unknown }>(
      "SELECT event FROM properties.listing_event ORDER BY (event->>'occurredAt')::timestamptz,event_id LIMIT 10001",
    );
    if (listingRows.length > 10000)
      throw new RangeError(
        'Resolution retained-event bound exceeded; no partial effects were written.',
      );
    const listingEvents = orderListingEvents(
      listingRows.map((row) => {
        const event = parsePropertiesEvent(row.event);
        if (!('listing' in event.payload))
          throw new Error('Retained listing evidence contains a non-listing event.');
        return event as RetainedListingEvent;
      }),
    );
    const newListings = new Set(
      input.inputs
        .filter((member) => !assignments.has(member.listingId))
        .map((member) => member.listingId),
    );
    for (const member of input.inputs) {
      if (assignments.has(member.listingId)) {
        const assignment = assignments.get(member.listingId)!;
        if (
          !listingEvents.some(
            (event) =>
              event.aggregateId === member.listingId &&
              event.payload.revision === assignment.processed_revision,
          )
        )
          throw new Error('Assigned resolution member lost its retained authentic listing fact.');
        continue;
      }
      const latest = listingEvents
        .filter((event) => event.aggregateId === member.listingId && 'listing' in event.payload)
        .sort((a, b) => b.payload.revision - a.payload.revision)[0];
      if (!latest || !('listing' in latest.payload))
        throw new Error('Resolution requires retained authentic listing creation/history.');
      // The first scan establishes a baseline; historical listing changes are never republished as new property repricing.
      assignments.set(member.listingId, {
        listing_id: member.listingId,
        property_id: member.originalPropertyId,
        assignment_revision: 0,
        processed_revision: latest.payload.revision,
        market_fact: latest.payload.listing,
        input_event_id: member.inputEventId,
        input_hash: member.inputHash,
      });
    }
    // First-time complete groups retain authentic historical minimum changes without inventing
    // a v2 publication, revision, or receipt-time repricing. Membership is the baseline decision.
    for (const group of input.groups) {
      if (!group.listingIds.every((id) => newListings.has(id))) continue;
      const historical = new Map<string, CausalListingState>();
      for (const event of listingEvents) {
        if (!group.listingIds.includes(event.aggregateId)) continue;
        signal.throwIfAborted();
        const before = historical.size ? minimum(group.propertyId, [...historical.values()]) : null;
        historical.set(event.aggregateId, {
          listing: { ...event.payload.listing, propertyId: group.propertyId },
          revision: event.payload.revision,
          assignmentRevision: 0,
        });
        const after = minimum(group.propertyId, [...historical.values()]);
        if (
          before &&
          event.type !== 'properties.listing.created' &&
          before.minimumMinorUnits !== after.minimumMinorUnits
        )
          await client.query(
            'INSERT INTO properties.property_minimum_effect (cause_event_id,property_id,minimum_effect,publication_event_id) VALUES ($1,$2,$3::jsonb,NULL) ON CONFLICT DO NOTHING',
            [
              event.eventId,
              group.propertyId,
              JSON.stringify({
                effectiveAt: event.payload.effectiveAt,
                previous: before,
                current: after,
              }),
            ],
          );
      }
    }
    const states = (propertyIds: readonly string[]): CausalListingState[] =>
      [...assignments.values()]
        .filter((a) => propertyIds.includes(a.property_id))
        .map((a) => ({
          listing: { ...a.market_fact, propertyId: a.property_id },
          revision: a.processed_revision,
          assignmentRevision: a.assignment_revision,
        }))
        .sort((a, b) => (a.listing.listingId < b.listing.listingId ? -1 : 1));
    const minima = (propertyIds: readonly string[]): MinimumAskingPriceFact[] =>
      propertyIds.map((id) => minimum(id, states([id])));
    const publish = async (
      event: PropertiesEventV2 | PropertyMatchQueuedForReview,
      cause?: { eventId: string; effectiveAt: string },
    ) => {
      const payload: unknown = JSON.parse(JSON.stringify(event.payload));
      if (!isSerializableEventPayload(payload))
        throw new TypeError('Invalid resolution event payload.');
      published.push({ ...event, payload });
      if (event.type === 'properties.property.asking-price-changed')
        await client.query(
          'INSERT INTO properties.property_minimum_effect (cause_event_id,property_id,minimum_effect,publication_event_id) VALUES ($1,$2,$3::jsonb,$4)',
          [
            cause!.eventId,
            event.aggregateId,
            JSON.stringify({
              effectiveAt: cause!.effectiveAt,
              previous: (event as PropertiesEventV2<'properties.property.asking-price-changed'>)
                .payload.previous,
              current: (event as PropertiesEventV2<'properties.property.asking-price-changed'>)
                .payload.current,
            }),
            event.eventId,
          ],
        );
    };
    for (const event of listingEvents) {
      signal.throwIfAborted();
      const assignment = assignments.get(event.aggregateId);
      if (
        !assignment ||
        !('listing' in event.payload) ||
        event.payload.revision <= assignment.processed_revision
      )
        continue;
      const previousStates = states([assignment.property_id]);
      const previous = minimum(assignment.property_id, previousStates);
      assignment.market_fact = event.payload.listing;
      assignment.processed_revision = event.payload.revision;
      const current = minima([assignment.property_id])[0]!;
      if (previous.minimumMinorUnits !== current.minimumMinorUnits) {
        const members = states([assignment.property_id]);
        const effectiveAt = latestEffective(
          previousStates,
          latestEffective(members, event.payload.effectiveAt),
        );
        await publish(
          new PropertiesEventV2('properties.property.asking-price-changed', {
            eventId: await this.identifiers.generate(transaction),
            aggregateId: assignment.property_id,
            occurredAt: effectiveAt,
            payload: {
              revision: await nextRevision(client, assignment.property_id),
              effectiveAt,
              previous,
              current,
              listingStates: members,
            },
          }),
          { eventId: event.eventId, effectiveAt: event.payload.effectiveAt },
        );
      }
    }
    const transition = async (
      type: 'properties.property.split' | 'properties.property.merged',
      from: readonly string[],
      destinations: ReadonlyMap<string, string>,
    ) => {
      const members = states(from),
        previous = minima(from);
      const to = [...new Set(destinations.values())].sort();
      const changes = members.map((state) => ({
        listingId: state.listing.listingId,
        fromPropertyId: state.listing.propertyId,
        toPropertyId: destinations.get(state.listing.listingId)!,
        fromAssignmentRevision: state.assignmentRevision,
        assignmentRevision: state.assignmentRevision + 1,
      }));
      for (const change of changes) {
        const a = assignments.get(change.listingId)!;
        a.property_id = change.toPropertyId;
        a.assignment_revision = change.assignmentRevision;
      }
      const resulting = minima(to),
        aggregateId = to[0]!,
        effectiveAt = latestEffective(members);
      await publish(
        new PropertiesEventV2(type, {
          eventId: await this.identifiers.generate(transaction),
          aggregateId,
          occurredAt: effectiveAt,
          payload: {
            revision: await nextRevision(client, aggregateId),
            effectiveAt,
            previous,
            resulting,
            listingStates: members,
            assignments: changes,
          },
        }),
      );
    };
    const desired = new Map(
      input.groups.flatMap((group) =>
        group.listingIds.map((id) => [id, group.propertyId] as const),
      ),
    );
    // First dissolve changed old groups into immutable original identities. This respects strict split/merge cardinalities even when members move between groups.
    for (const propertyId of [
      ...new Set([...assignments.values()].map((a) => a.property_id)),
    ].sort()) {
      const members = [...assignments.values()].filter((a) => a.property_id === propertyId);
      if (members.length > 1 && members.some((a) => desired.get(a.listing_id) !== propertyId)) {
        const destinations = new Map(
          members.map((a) => [
            a.listing_id,
            input.inputs.find((i) => i.listingId === a.listing_id)!.originalPropertyId,
          ]),
        );
        await transition('properties.property.split', [propertyId], destinations);
      }
    }
    for (const group of input.groups) {
      const from = [
        ...new Set(group.listingIds.map((id) => assignments.get(id)!.property_id)),
      ].sort();
      if (from.length > 1)
        await transition(
          'properties.property.merged',
          from,
          new Map(group.listingIds.map((id) => [id, group.propertyId])),
        );
    }
    for (const comparison of input.comparisons) {
      signal.throwIfAborted();
      const inserted = await client.query<{ left_listing_id: string }>(
        `INSERT INTO properties.match_comparison (left_listing_id,right_listing_id,left_input_event_id,right_input_event_id,configuration_id,configuration_version,evidence,left_input_hash,right_input_hash)
        VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) ON CONFLICT DO NOTHING RETURNING left_listing_id`,
        [
          comparison.leftListingId,
          comparison.rightListingId,
          comparison.leftInputEventId,
          comparison.rightInputEventId,
          configuration.id,
          configuration.version,
          JSON.stringify(comparison),
          input.inputs.find((member) => member.listingId === comparison.leftListingId)!.inputHash,
          input.inputs.find((member) => member.listingId === comparison.rightListingId)!.inputHash,
        ],
      );
      if (inserted.length && comparison.decision === 'review') {
        const event = new PropertyMatchQueuedForReview({
          eventId: await this.identifiers.generate(transaction),
          aggregateId: comparison.leftListingId,
          occurredAt: latestEffective(
            states([...new Set([...assignments.values()].map((a) => a.property_id))]),
          ),
          payload: {
            configurationId: configuration.id,
            configurationVersion: configuration.version,
            comparison,
          },
        });
        await publish(event);
        await client.query(
          `UPDATE properties.match_comparison SET review_event_id=$7 WHERE left_listing_id=$1 AND right_listing_id=$2 AND left_input_event_id=$3 AND right_input_event_id=$4 AND configuration_id=$5 AND configuration_version=$6`,
          [
            comparison.leftListingId,
            comparison.rightListingId,
            comparison.leftInputEventId,
            comparison.rightInputEventId,
            configuration.id,
            configuration.version,
            event.eventId,
          ],
        );
      }
    }
    for (const member of input.inputs) {
      const a = assignments.get(member.listingId)!;
      if (!member.continuityGroupId)
        await client.query(
          'UPDATE properties.listing_assignment SET suppression_continuity_hash=NULL WHERE listing_id=$1 AND suppression_continuity_hash IS NOT NULL',
          [member.listingId],
        );
      await client.query(
        `INSERT INTO properties.listing_assignment (listing_id,property_id,assignment_revision,processed_revision,market_fact,input_event_id,input_hash,configuration_id,configuration_version) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
        ON CONFLICT (listing_id) DO UPDATE SET property_id=EXCLUDED.property_id,assignment_revision=EXCLUDED.assignment_revision,processed_revision=EXCLUDED.processed_revision,market_fact=EXCLUDED.market_fact,input_event_id=EXCLUDED.input_event_id,input_hash=EXCLUDED.input_hash,configuration_id=EXCLUDED.configuration_id,configuration_version=EXCLUDED.configuration_version
        WHERE (listing_assignment.property_id,listing_assignment.assignment_revision,listing_assignment.processed_revision,listing_assignment.market_fact,listing_assignment.input_event_id,listing_assignment.input_hash,listing_assignment.configuration_id,listing_assignment.configuration_version) IS DISTINCT FROM (EXCLUDED.property_id,EXCLUDED.assignment_revision,EXCLUDED.processed_revision,EXCLUDED.market_fact,EXCLUDED.input_event_id,EXCLUDED.input_hash,EXCLUDED.configuration_id,EXCLUDED.configuration_version)`,
        [
          a.listing_id,
          a.property_id,
          a.assignment_revision,
          a.processed_revision,
          JSON.stringify(a.market_fact),
          member.inputEventId,
          member.inputHash,
          configuration.id,
          configuration.version,
        ],
      );
    }
    signal.throwIfAborted();
    if (published.length) await this.outbox.append(transaction, published);
    return published.length;
  }
}
import { parseCollectionEvent } from '@rei/domain';
function parseCollectionInput(value: unknown) {
  return parseCollectionEvent(value);
}
function minimum(
  propertyId: string,
  states: readonly CausalListingState[],
): MinimumAskingPriceFact {
  const active = states
    .filter((s) => s.listing.status === 'active')
    .sort(
      (a, b) =>
        a.listing.askingPriceMinorUnits - b.listing.askingPriceMinorUnits ||
        (a.listing.listingId < b.listing.listingId ? -1 : 1),
    );
  const selected = active[0]?.listing,
    fallback = states[0]!.listing;
  return {
    propertyId,
    placeId: selected?.placeId ?? fallback.placeId,
    areaSquareMeters: selected?.areaSquareMeters ?? null,
    minimumMinorUnits: selected?.askingPriceMinorUnits ?? null,
    currency: 'BRL',
    selectedListingId: selected?.listingId ?? null,
    provenance: selected?.provenance ?? null,
    activeListingIds: active.map((s) => s.listing.listingId).sort(),
  };
}
function latestEffective(
  states: readonly CausalListingState[],
  initial = '1970-01-01T00:00:00.000Z',
): string {
  return states.reduce(
    (latest, s) => (s.listing.effectiveAt > latest ? s.listing.effectiveAt : latest),
    initial,
  );
}
async function nextRevision(client: DatabaseClient, propertyId: string): Promise<number> {
  const rows = await client.query<{ revision: number }>(
    `INSERT INTO properties.resolution_property_state (property_id,revision) VALUES ($1,1) ON CONFLICT (property_id) DO UPDATE SET revision=resolution_property_state.revision+1 RETURNING revision`,
    [propertyId],
  );
  return rows[0]!.revision;
}

export function matchingHash(listing: NormalizedListing): string {
  const values = [
    listing.propertyType.value,
    normalizePlaceName(listing.location.city.value),
    normalizePlaceName(listing.location.stateCode.value),
    normalizeStreetName(listing.location.street.value),
    listing.areaSquareMeters.value,
    listing.bedrooms.value,
    [
      ...new Set(
        listing.maskedDescription.value
          .normalize('NFC')
          .toLowerCase()
          .normalize('NFC')
          .match(/[\p{L}\p{M}\p{N}]+/gu) ?? [],
      ),
    ].sort(),
    [...new Set(listing.imageFingerprints.map((image) => image.value))].sort(),
  ];
  return `sha256:${createHash('sha256').update(JSON.stringify(values)).digest('hex')}`;
}

/** Merge per-listing revision queues: timestamps break ties only among causally ready heads. */
function orderListingEvents(events: readonly RetainedListingEvent[]): RetainedListingEvent[] {
  const queues = new Map<string, RetainedListingEvent[]>();
  for (const event of events) {
    const queue = queues.get(event.aggregateId) ?? [];
    queue.push(event);
    queues.set(event.aggregateId, queue);
  }
  for (const queue of queues.values())
    queue.sort((left, right) => left.payload.revision - right.payload.revision);
  const result: RetainedListingEvent[] = [];
  while (queues.size) {
    const next = [...queues.entries()].sort(
      ([, left], [, right]) =>
        left[0]!.occurredAt.localeCompare(right[0]!.occurredAt) ||
        left[0]!.eventId.localeCompare(right[0]!.eventId),
    )[0]!;
    result.push(next[1].shift()!);
    if (!next[1].length) queues.delete(next[0]);
  }
  return result;
}
