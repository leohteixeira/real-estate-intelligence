import {
  immutableSerializableValue,
  isSerializableValue,
  type SerializableValue,
} from './serializable.js';
import { parseRfc3339Timestamp } from './timestamp.js';
import { DomainValidationError } from './validation-error.js';

export interface ProvenanceInput<TValue extends SerializableValue> {
  readonly value: TValue;
  readonly source: string;
  readonly collectedAt: string;
  readonly sourceUrl: string;
}

/** An immutable value together with the evidence of where and when it was collected. */
export class Provenance<TValue extends SerializableValue> {
  public readonly value: TValue;
  public readonly source: string;
  public readonly collectedAt: string;
  public readonly sourceUrl: string;

  public constructor(input: ProvenanceInput<TValue>) {
    if (!isSerializableValue(input.value)) {
      throw new DomainValidationError(
        'Provenance value must contain only serializable values.',
        'value',
      );
    }

    if (input.source.trim().length === 0) {
      throw new DomainValidationError('Provenance source must not be empty.', 'source');
    }

    try {
      const NativeUrl = (globalThis as unknown as { readonly URL: new (input: string) => unknown })
        .URL;
      new NativeUrl(input.sourceUrl);
    } catch {
      throw new DomainValidationError('Provenance sourceUrl must be an absolute URL.', 'sourceUrl');
    }

    this.value = immutableSerializableValue(input.value);
    this.source = input.source;
    this.collectedAt = parseRfc3339Timestamp(input.collectedAt, 'collectedAt');
    this.sourceUrl = input.sourceUrl;
    Object.freeze(this);
  }
}
