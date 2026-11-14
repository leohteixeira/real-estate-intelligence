import type { MessageEvent } from '@nestjs/common';
import type { AskLiveFacade } from '@rei/application';
import { parseAskLiveEvent, type AskLiveEvent } from '@rei/contracts';
import { Observable } from 'rxjs';
/**
 * A queued, running or paused run can stay silent for minutes. Without a periodic sign of life the
 * client's next-frame deadline cannot tell a slow run from a dead connection.
 */
export const askLiveStreamSettings = Object.freeze({ heartbeatIntervalMs: 4_000 });
/** One outstanding cancellable SQL read. Transport errors end transport without inventing history. */
export function askLiveStream(
  live: AskLiveFacade,
  id: string,
  capability: string,
  after: number,
  initial: readonly AskLiveEvent[],
  alreadyTerminal: boolean,
  heartbeat?: () => void,
): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const beat = heartbeat
      ? setInterval(() => {
          if (!subscriber.closed) heartbeat();
        }, askLiveStreamSettings.heartbeatIntervalMs)
      : undefined;
    // Completion and unsubscription both run this teardown.
    subscriber.add(() => clearInterval(beat));
    let sequence = after;
    const emit = (frames: readonly AskLiveEvent[]): boolean => {
      for (const untrusted of frames) {
        if (subscriber.closed) return true;
        const frame = parseAskLiveEvent(untrusted);
        if (frame.sequence !== sequence + 1) throw new Error('Ask stream unavailable.');
        sequence = frame.sequence;
        subscriber.next({ id: frame.id, type: frame.event, data: frame });
        if (frame.terminal) {
          subscriber.complete();
          return true;
        }
      }
      return false;
    };
    const poll = async (): Promise<void> => {
      try {
        if (emit(await live.events(id, capability, sequence, controller.signal))) return;
        if (!subscriber.closed)
          timer = setTimeout(() => {
            void poll();
          }, 100);
      } catch {
        if (!subscriber.closed) subscriber.complete();
      }
    };
    try {
      if (!emit(initial)) {
        if (alreadyTerminal) subscriber.complete();
        else
          timer = setTimeout(() => {
            void poll();
          }, 100);
      }
    } catch {
      subscriber.complete();
    }
    return () => {
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  });
}
