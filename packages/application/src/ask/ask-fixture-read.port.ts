import type {
  AskAvailability,
  AskFixtureCatalogue,
  AskProgressEvent,
  AskRun,
  AskThread,
} from '@rei/domain';

/** Public synthetic grants precede all history reads. No live dispatch or storage port exists. */
export interface AskFixtureReadPort {
  availability(): Promise<AskAvailability>;
  catalogue(): Promise<AskFixtureCatalogue>;
  capabilityFor(kind: 'run' | 'thread', id: string): Promise<string | null>;
  run(id: string): Promise<AskRun | null>;
  thread(id: string): Promise<AskThread | null>;
  preview(id: string): Promise<readonly AskProgressEvent[] | null>;
}
