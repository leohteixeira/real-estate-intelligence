import {
  parseAskProgressEvent,
  parseAskAvailability,
  parseAskFixtureCatalogue,
  parseAskRun,
  parseAskThread,
  type AskRun,
} from '@rei/contracts';
import { ApiReadError } from '../api/read-error.js';
import { config } from '../config';
import { AskSession } from './ask-session';
import type { AdmittedFrame } from './ask-stream.js';
import { createAskTransport, askTransportPolicy } from './ask-transport.js';
export { askTransportPolicy } from './ask-transport.js';

export function createAskClient(baseUrl = config.apiBaseUrl) {
  const transport = createAskTransport(baseUrl);
  return {
    availability: (signal: AbortSignal) =>
      transport.read('/ask/capabilities', signal, parseAskAvailability),
    catalogue: (signal: AbortSignal) =>
      transport.read('/ask/fixtures', signal, parseAskFixtureCatalogue),
    run: (id: string, capability: string, signal: AbortSignal) =>
      transport.read(`/runs/${id}`, signal, parseAskRun, capability),
    thread: (id: string, capability: string, signal: AbortSignal) =>
      transport.read(`/threads/${id}`, signal, parseAskThread, capability),
    events: (
      id: string,
      capability: string,
      cursor: string | undefined,
      signal: AbortSignal,
      onFrame: (frame: AdmittedFrame) => void,
    ) => transport.events(id, capability, cursor, signal, parseAskProgressEvent, onFrame),
  };
}

export async function followAsk(
  client: ReturnType<typeof createAskClient>,
  session: AskSession,
  capability: string,
  signal: AbortSignal,
  onSnapshot: (run: AskRun) => void,
): Promise<void> {
  if (session.terminal) return;
  for (let attempt = 0; attempt <= askTransportPolicy.maxAutomaticReconnects; attempt++) {
    try {
      await client.events(session.run.id, capability, session.cursor, signal, (frame) => {
        if (session.admit(frame)) onSnapshot(session.run);
      });
      if (session.terminal) return;
      throw new ApiReadError(0);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (
        !(error instanceof ApiReadError) ||
        ![0, 408].includes(error.status) ||
        attempt === askTransportPolicy.maxAutomaticReconnects
      )
        throw error;
    }
  }
}
