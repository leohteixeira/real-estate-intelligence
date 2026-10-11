import {
  parseWire,
  wireEnum,
  wireNullable,
  wireObject,
  wireSlug,
  wireDate,
} from '../shared/wire.js';
import { askCapabilityWire, askIdWire, askInputsWire, askQueryWire } from './ask.read.dto.js';
import type {
  AskAccepted,
  AskCancelRequest,
  AskConfirmRequest,
  AskCreateRequest,
  AskQuotaRejection,
} from './ask.read.types.js';

export interface AskCommandHeaders {
  readonly idempotencyKey: string;
}
/** Reserved Idempotency-Key header: 16–128 ASCII letters, digits, underscores or hyphens. */
export function parseAskCommandHeaders(value: unknown): AskCommandHeaders {
  return parseWire(value, wireObject({ idempotencyKey: askCapabilityWire }));
}

/** Reserved shapes only; the fixture API exposes no command handler. */
export function parseAskCreateRequest(value: unknown): AskCreateRequest {
  return parseWire(
    value,
    wireObject({
      threadId: wireNullable(askIdWire),
      placeId: wireNullable(wireSlug),
      query: askQueryWire,
      locale: wireEnum(['en', 'pt-BR']),
    }),
  );
}
export function parseAskConfirmRequest(value: unknown): AskConfirmRequest {
  return parseWire(
    value,
    wireObject({ intent: wireEnum(['price_per_square_meter']), inputs: askInputsWire }),
  );
}
export function parseAskCancelRequest(value: unknown): AskCancelRequest {
  return parseWire(value, wireObject({ reason: wireEnum(['visitor_cancelled']) }));
}
export function parseAskAccepted(value: unknown): AskAccepted {
  return parseWire(
    value,
    wireObject({
      runId: askIdWire,
      threadId: askIdWire,
      capability: askCapabilityWire,
      state: wireEnum(['queued']),
    }),
  );
}
export function parseAskQuotaRejection(value: unknown): AskQuotaRejection {
  return parseWire(
    value,
    wireObject({
      code: wireEnum(['quota_exceeded']),
      scope: wireEnum(['visitor', 'global']),
      reopensAt: wireDate,
    }),
  );
}
