import {
  invalidWire,
  parseWire,
  wireArray,
  wireBoolean,
  wireDiscriminated,
  wireEnum,
  wireNull,
  wireObject,
  wireSlug,
  wireString,
  wireUrl,
} from '../shared/wire.js';

/** Independent source capabilities exposed by the versioned HTTP contract. */
export interface EnabledSourcePermissionsDto {
  readonly collectionAllowed: boolean;
  readonly imageFetchingAllowed: boolean;
  readonly listingTextDisplayAllowed: boolean;
}

export type SourceLicenceDto =
  | {
      readonly status: 'licensed';
      readonly label: string;
      readonly url: string;
    }
  | {
      readonly status: 'not-verified';
      readonly label: null;
      readonly url: null;
    }
  | {
      readonly status: 'not-applicable';
      readonly label: string;
      readonly url: null;
    };

/** JSON-only source entry used by the enabled-sources privacy response. */
export interface EnabledSourceDto {
  readonly sourceId: string;
  readonly displayLabel: string;
  readonly enabled: true;
  readonly permissions: EnabledSourcePermissionsDto;
  readonly licence: SourceLicenceDto;
}

export interface EnabledSourcesResponse {
  readonly sources: readonly EnabledSourceDto[];
}

function hasControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.codePointAt(0)!;
    return code < 32 || code === 127;
  });
}
function publicLabel(value: unknown): void {
  wireString(value);
  if (
    typeof value !== 'string' ||
    value.trim() !== value ||
    value.length > 500 ||
    hasControl(value)
  )
    invalidWire();
}
function licenceUrl(value: unknown): void {
  wireUrl(value);
  if (typeof value !== 'string' || hasControl(value) || /[\s\\]/.test(value)) invalidWire();
}
const enabledSource = wireObject({
  sourceId: (value) => {
    wireSlug(value);
    if (typeof value !== 'string' || value.length > 200) invalidWire();
  },
  displayLabel: publicLabel,
  enabled: wireEnum([true]),
  permissions: wireObject({
    collectionAllowed: wireBoolean,
    imageFetchingAllowed: wireBoolean,
    listingTextDisplayAllowed: wireBoolean,
  }),
  licence: wireDiscriminated('status', {
    licensed: wireObject({ status: wireEnum(['licensed']), label: publicLabel, url: licenceUrl }),
    'not-verified': wireObject({
      status: wireEnum(['not-verified']),
      label: wireNull,
      url: wireNull,
    }),
    'not-applicable': wireObject({
      status: wireEnum(['not-applicable']),
      label: publicLabel,
      url: wireNull,
    }),
  }),
});

/** Admit only the complete public response, without inventing source or licence evidence. */
export function parseEnabledSourcesResponse(value: unknown): EnabledSourcesResponse {
  const response = parseWire<EnabledSourcesResponse>(
    value,
    wireObject({ sources: wireArray(enabledSource) }),
  );
  const identities = new Set(response.sources.map((source) => source.sourceId));
  if (identities.size !== response.sources.length) invalidWire();
  return response;
}

export const SYNTHETIC_ENABLED_SOURCE: EnabledSourceDto = Object.freeze({
  sourceId: 'synthetic-data',
  displayLabel: 'Labelled synthetic fixture',
  enabled: true,
  permissions: Object.freeze({
    collectionAllowed: true,
    imageFetchingAllowed: true,
    listingTextDisplayAllowed: true,
  }),
  licence: Object.freeze({
    status: 'not-applicable',
    label: 'Synthetic data',
    url: null,
  }),
});
