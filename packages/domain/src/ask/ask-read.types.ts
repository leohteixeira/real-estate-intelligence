/** Prepared Ask examples. No provider provenance, live execution or durable replay is implied. */
export const ASK_STATES = [
  'queued',
  'running',
  'awaiting_confirmation',
  'completed',
  'failed',
  'cancelled',
  'expired',
] as const;
export type AskState = (typeof ASK_STATES)[number];
export type AskTerminalState = 'completed' | 'failed' | 'cancelled' | 'expired';
export interface AskMetadata {
  readonly fixtureVersion: 'ask-v1';
  readonly asOf: string;
  readonly synthetic: true;
  readonly liveExecution: false;
  readonly durableReplay: false;
}
export interface AskExample {
  readonly basis: 'prepared-ask-example';
  readonly metadata: AskMetadata;
}
export interface AskInputs {
  readonly priceMinorUnits: number;
  readonly currency: 'BRL';
  readonly areaSquareMeters: number;
}
export interface AskDecision {
  readonly intent: 'price_per_square_meter' | 'unavailable';
  readonly confidence: number;
  readonly degraded: boolean;
  readonly requiresConfirmation: boolean;
  readonly source: 'synthetic-fixture';
  readonly decidedAt: string;
}
export interface AskConfirmation {
  readonly intent: 'price_per_square_meter';
  readonly inputs: AskInputs;
  readonly confirmedAt: string;
  readonly source: 'recorded-synthetic';
}
export type AskResult =
  | {
      readonly kind: 'price_per_square_meter';
      readonly minorUnits: number;
      readonly currency: 'BRL';
      readonly areaUnit: 'm2';
      readonly inputs: AskInputs;
      readonly computedAt: string;
    }
  | { readonly kind: 'unavailable_intent'; readonly reason: 'not_available' };
export interface AskStep {
  readonly sequence: number;
  readonly phase:
    | 'interpreting'
    | 'awaiting_confirmation'
    | 'confirmed'
    | 'calculating'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'expired';
  readonly at: string;
}
export interface AskTerminal {
  readonly state: AskTerminalState;
  readonly reason:
    | 'fixture_failure'
    | 'preview_unavailable'
    | 'visitor_cancelled'
    | 'confirmation_expired'
    | null;
  readonly at: string;
}
export interface AskRun extends AskExample {
  readonly id: string;
  readonly threadId: string;
  readonly principalId: string | null;
  readonly question: string;
  readonly locale: 'en' | 'pt-BR';
  readonly placeId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly state: AskState;
  readonly originalInputs: AskInputs | null;
  readonly decision: AskDecision | null;
  readonly confirmation: AskConfirmation | null;
  readonly result: AskResult | null;
  readonly terminal: AskTerminal | null;
  readonly steps: readonly AskStep[];
}
export interface AskThread extends AskExample {
  readonly id: string;
  readonly principalId: string | null;
  readonly runs: readonly AskRun[];
}
export interface AskAvailability extends AskExample {
  readonly mode: 'prepared-fixtures';
  readonly commandHandlers: false;
  readonly intents: readonly {
    readonly intent: 'price_per_square_meter' | 'unavailable';
    readonly available: boolean;
  }[];
}
export interface AskFixtureGrant {
  readonly scope: 'synthetic-fixture';
  readonly capability: string;
}
export interface AskFixtureCatalogue extends AskExample {
  readonly items: readonly {
    readonly runId: string;
    readonly threadId: string;
    readonly state: AskState;
    readonly grant: AskFixtureGrant;
  }[];
}
export interface AskProgressEvent extends AskExample {
  readonly version: 1;
  readonly id: string;
  readonly runId: string;
  readonly sequence: number;
  readonly event: 'ask.progress' | 'ask.completed' | 'ask.failed' | 'ask.cancelled' | 'ask.expired';
  readonly terminal: boolean;
  readonly run: AskRun;
}
export interface AskCreateRequest {
  readonly threadId: string | null;
  readonly placeId: string | null;
  readonly query: string;
  readonly locale: 'en' | 'pt-BR';
}
export interface AskConfirmRequest {
  readonly intent: 'price_per_square_meter';
  readonly inputs: AskInputs;
}
export interface AskCancelRequest {
  readonly reason: 'visitor_cancelled';
}
export interface AskAccepted {
  readonly runId: string;
  readonly threadId: string;
  readonly capability: string;
  readonly state: 'queued';
}
export interface AskQuotaRejection {
  readonly code: 'quota_exceeded';
  readonly scope: 'visitor' | 'global';
  readonly reopensAt: string;
}
