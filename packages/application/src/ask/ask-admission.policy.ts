/** Poll retained sibling state promptly; this does not shorten its persisted execution lease. */
export const askAdmissionPolicy = Object.freeze({ maximumBusyRetryAfterMs: 1000 });
