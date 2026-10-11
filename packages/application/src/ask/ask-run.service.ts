import type { AskRunRepository } from './ask-run.repository.js';
export class AskRunService {
  public constructor(private readonly repository: AskRunRepository) {}
  public readonly create: AskRunRepository['create'] = (...args) => this.repository.create(...args);
  public readonly run: AskRunRepository['run'] = (...args) => this.repository.run(...args);
  public readonly thread: AskRunRepository['thread'] = (...args) => this.repository.thread(...args);
  public readonly events: AskRunRepository['events'] = (...args) => this.repository.events(...args);
  public readonly claim: AskRunRepository['claim'] = (...args) => this.repository.claim(...args);
  public readonly tool: AskRunRepository['tool'] = (...args) => this.repository.tool(...args);
  public readonly complete: AskRunRepository['complete'] = (...args) =>
    this.repository.complete(...args);
}
