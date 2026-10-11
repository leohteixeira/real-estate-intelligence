import type {
  AskAvailability,
  AskFixtureCatalogue,
  AskProgressEvent,
  AskRun,
  AskThread,
} from '@rei/domain';

export const ASK_FACADE = Symbol.for('rei.AskFacade');
export class AskAccessDeniedError extends Error {
  public constructor() {
    super('Ask access refused.');
    this.name = 'AskAccessDeniedError';
  }
}
export interface AskFacade {
  availability(): Promise<AskAvailability>;
  catalogue(): Promise<AskFixtureCatalogue>;
  run(id: string, capability: string): Promise<AskRun | null>;
  thread(id: string, capability: string): Promise<AskThread | null>;
  preview(
    id: string,
    capability: string,
    cursor?: string,
  ): Promise<readonly AskProgressEvent[] | null>;
}
