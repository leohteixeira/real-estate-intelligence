import { assertAskPreview, DomainValidationError } from '@rei/domain';
import { AskAccessDeniedError, type AskFacade } from './ask.facade.js';
import type { AskFixtureReadPort } from './ask-fixture-read.port.js';

export class AskQueryService implements AskFacade {
  public constructor(private readonly fixtures: AskFixtureReadPort) {}
  public async availability() {
    return structuredClone(await this.fixtures.availability());
  }
  public async catalogue() {
    return structuredClone(await this.fixtures.catalogue());
  }
  private async authorize(kind: 'run' | 'thread', id: string, capability: string): Promise<void> {
    // Reject malformed authority before resolving a resource or requesting its history.
    if (
      typeof capability !== 'string' ||
      capability.trim() !== capability ||
      !/^[a-zA-Z0-9_-]{16,128}$/.test(capability)
    )
      throw new AskAccessDeniedError();
    if (
      typeof id !== 'string' ||
      id.length !== 36 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    )
      throw new DomainValidationError('Invalid Ask identifier.', 'id');
    const expected = await this.fixtures.capabilityFor(kind, id);
    if (expected === null || expected !== capability) throw new AskAccessDeniedError();
  }
  public async run(id: string, capability: string) {
    await this.authorize('run', id, capability);
    return structuredClone(await this.fixtures.run(id));
  }
  public async thread(id: string, capability: string) {
    await this.authorize('thread', id, capability);
    return structuredClone(await this.fixtures.thread(id));
  }
  public async preview(id: string, capability: string, cursor?: string) {
    await this.authorize('run', id, capability);
    const frames = await this.fixtures.preview(id);
    if (frames === null) return null;
    assertAskPreview(frames);
    let sequence = 0;
    if (cursor !== undefined) {
      const prefix = `${id}:v1:`;
      const suffix = cursor.startsWith(prefix) ? cursor.slice(prefix.length) : '';
      if (
        !/^[1-9]\d{0,2}$/.test(suffix) ||
        String(Number(suffix)) !== suffix ||
        Number(suffix) > frames.length
      )
        throw new DomainValidationError('Invalid Ask replay cursor.', 'cursor');
      sequence = Number(suffix);
    }
    return structuredClone(frames.filter((frame) => frame.sequence > sequence));
  }
}
