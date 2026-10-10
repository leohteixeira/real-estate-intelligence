import { describe, expect, it } from 'vitest';

import type { AuditTraceAcceptedResponse } from './trace-requested.dto.js';

describe('AuditTraceAcceptedResponse', () => {
  it('contains only the accepted event identifier', () => {
    const response: AuditTraceAcceptedResponse = {
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
    };

    expect(response).toEqual({ eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' });
  });
});
