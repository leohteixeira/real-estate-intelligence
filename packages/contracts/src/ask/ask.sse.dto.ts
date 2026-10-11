import {
  invalidWire,
  parseWire,
  wireBoolean,
  wireEnum,
  wireNumber,
  wireObject,
  wireString,
} from '../shared/wire.js';
import { askBaseWire, askIdWire, askRunWire, validateAskRun } from './ask.read.dto.js';
import type { AskProgressEvent } from './ask.read.types.js';

export function parseAskProgressEvent(value: unknown): AskProgressEvent {
  const frame = parseWire<AskProgressEvent>(
    value,
    wireObject({
      ...askBaseWire,
      version: wireEnum([1]),
      id: wireString,
      runId: askIdWire,
      sequence: wireNumber(1, 100, true),
      event: wireEnum([
        'ask.progress',
        'ask.completed',
        'ask.failed',
        'ask.cancelled',
        'ask.expired',
      ]),
      terminal: wireBoolean,
      run: askRunWire,
    }),
  );
  validateAskRun(frame.run);
  const terminal = ['completed', 'failed', 'cancelled', 'expired'].includes(frame.run.state);
  if (
    frame.runId !== frame.run.id ||
    frame.id !== `${frame.runId}:v1:${frame.sequence}` ||
    frame.terminal !== terminal ||
    frame.event !== (terminal ? `ask.${frame.run.state}` : 'ask.progress') ||
    frame.metadata.asOf !== frame.run.metadata.asOf
  )
    invalidWire();
  return frame;
}
