/**
 * The HTTP contract is versioned in the path. Every business endpoint lives
 * under this prefix; `/health` and `/ready` stay outside it because they are
 * operational, not part of the product contract.
 */
export const API_VERSION = 'v1' as const;

export const API_PREFIX = `api/${API_VERSION}` as const;
