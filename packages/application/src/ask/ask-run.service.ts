import type { AskRunRepository } from './ask-run.repository.js';
import type { TextAskCreateInput } from '@rei/domain';
import type { MarketCalculationFacade } from '../market/index.js';
import type { AskLiveFacade, TextAskAdmission } from './ask-live.facade.js';
export class AskRunService implements AskLiveFacade {
  public constructor(
    private readonly repository: AskRunRepository,
    private readonly market?: MarketCalculationFacade,
  ) {}
  public async createText(
    request: TextAskCreateInput,
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
  public async createRouted(
    request: import('@rei/domain').RoutedAskCreateInput,
    capability: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<import('@rei/domain').AskLiveRun> {
    signal?.throwIfAborted();
    if (!this.market) throw new Error('Market calculation unavailable.');
    const extracted = this.market.extractPriceInputs(request.query, request.locale);
    return this.repository.create(
      { ...request, inputs: extracted.kind === 'refused' ? null : extracted.inputs },
      capability,
      key,
      signal,
    );
  }
  public async confirm(
    request: import('@rei/domain').RoutedAskConfirmation,
    capability: string,
    signal?: AbortSignal,
  ): Promise<import('@rei/domain').AskLiveRun> {
    signal?.throwIfAborted();
    if (request.inputs) {
      if (!this.market) throw new Error('Market calculation unavailable.');
      // Reuse Market validation; a preview calculation has no durable tool effect.
      this.market.pricePerSquareMeter(request.inputs, new Date().toISOString());
    }
    return this.repository.confirm(request, capability, signal);
  }
  public readonly cancel: AskRunRepository['cancel'] = (...args) => this.repository.cancel(...args);
  public readonly refuse: AskRunRepository['refuse'] = (...args) => this.repository.refuse(...args);
  public readonly executeDecision: AskRunRepository['executeDecision'] = (...args) =>
    this.repository.executeDecision(...args);
  public readonly create: AskRunRepository['create'] = (...args) => this.repository.create(...args);
  public readonly expireQueued: AskRunRepository['expireQueued'] = (...args) =>
    this.repository.expireQueued(...args);
  public readonly run: AskRunRepository['run'] = (...args) => this.repository.run(...args);
  public readonly thread: AskRunRepository['thread'] = (...args) => this.repository.thread(...args);
  public readonly events: AskRunRepository['events'] = (...args) => this.repository.events(...args);
  public readonly claim: AskRunRepository['claim'] = (...args) => this.repository.claim(...args);
  public readonly tool: AskRunRepository['tool'] = (...args) => this.repository.tool(...args);
  public readonly complete: AskRunRepository['complete'] = (...args) =>
    this.repository.complete(...args);
}
