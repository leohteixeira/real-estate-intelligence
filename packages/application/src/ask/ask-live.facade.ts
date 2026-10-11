import type { AskRunRepository } from './ask-run.repository.js';
export const ASK_LIVE_FACADE = Symbol('ASK_LIVE_FACADE');
export type AskLiveFacade = AskRunRepository;
