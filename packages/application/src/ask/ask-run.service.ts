import type { AskRunRepository } from './ask-run.repository.js';
import type { TextAskCreate } from '@rei/domain';
import type { MarketCalculationFacade } from '../market/index.js';
import type { AskLiveFacade, TextAskAdmission } from './ask-live.facade.js';
export class AskRunService implements AskLiveFacade {
  public constructor(
    private readonly repository: AskRunRepository,
    private readonly market?: MarketCalculationFacade,
  ) {}
  public async createText(
    request: TextAskCreate,
    capability: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<TextAskAdmission> {
    signal?.throwIfAborted();
    if (!this.market) throw new Error('Market calculation unavailable.');
    const extraction = this.market.extractPriceInputs(request.query, request.locale);
    if (extraction.kind === 'refused') return extraction;
    const run = await this.repository.create(
      { ...request, inputs: { ...extraction.inputs } },
      capability,
      key,
      signal,
    );
    return { kind: 'accepted', run };
  }
  public readonly create: AskRunRepository['create'] = (...args) => this.repository.create(...args);
  public readonly run: AskRunRepository['run'] = (...args) => this.repository.run(...args);
  public readonly thread: AskRunRepository['thread'] = (...args) => this.repository.thread(...args);
  public readonly events: AskRunRepository['events'] = (...args) => this.repository.events(...args);
  public readonly claim: AskRunRepository['claim'] = (...args) => this.repository.claim(...args);
  public readonly tool: AskRunRepository['tool'] = (...args) => this.repository.tool(...args);
  public readonly complete: AskRunRepository['complete'] = (...args) =>
    this.repository.complete(...args);
}
