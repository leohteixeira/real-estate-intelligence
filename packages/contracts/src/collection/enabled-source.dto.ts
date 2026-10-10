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
  readonly enabled: boolean;
  readonly permissions: EnabledSourcePermissionsDto;
  readonly licence: SourceLicenceDto;
}

export const SYNTHETIC_ENABLED_SOURCE: EnabledSourceDto = Object.freeze({
  sourceId: 'synthetic-data',
  displayLabel: 'Synthetic dataset',
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
