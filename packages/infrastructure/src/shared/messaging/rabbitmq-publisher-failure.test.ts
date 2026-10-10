import { ExternalFailure } from '@rei/application';
import { describe, expect, it } from 'vitest';

import { translateRabbitMqPublisherFailure } from './rabbitmq-publisher-failure.js';

describe('translateRabbitMqPublisherFailure', () => {
  it.each([
    [{ code: 'ECONNRESET', message: 'amqp://user:secret@broker' }, 'connection', 'transient'],
    [new Error('publisher confirmation timed out'), 'confirm', 'transient'],
    [{ code: 406, message: 'PRECONDITION_FAILED secret exchange' }, 'publish', 'rejected'],
    [{ code: 530, message: 'NOT_ALLOWED user secret' }, 'connection', 'unauthorized'],
    [new Error('message nacked'), 'confirm', 'rejected'],
    [new Error('unknown channel failure'), 'publish', 'transient'],
  ] as const)('maps %p during %s to %s without retaining vendor detail', (error, phase, kind) => {
    const failure = translateRabbitMqPublisherFailure(error, new AbortController().signal, phase);

    expect(failure).toMatchObject({ kind, operation: 'event-publisher.publish' });
    expect(failure).not.toHaveProperty('cause');
    expect(failure.message).not.toMatch(/secret|exchange|amqp/i);
  });

  it('maps caller abort to cancelled and preserves an already closed failure', () => {
    const controller = new AbortController();
    controller.abort(new Error('private abort reason'));
    expect(
      translateRabbitMqPublisherFailure(controller.signal.reason, controller.signal, 'confirm'),
    ).toMatchObject({ kind: 'cancelled' });

    const closed = new ExternalFailure({ kind: 'forbidden', operation: 'publish' });
    expect(translateRabbitMqPublisherFailure(closed, new AbortController().signal, 'publish')).toBe(
      closed,
    );
  });

  it('keeps a timed-out attempt retryable for the outer policy', () => {
    const controller = new AbortController();
    const timeout = Object.assign(new Error('private timeout detail'), {
      name: 'ResilienceTimeoutError',
      code: 'TIMEOUT',
    });
    controller.abort(timeout);

    expect(translateRabbitMqPublisherFailure(timeout, controller.signal, 'confirm')).toMatchObject({
      kind: 'transient',
    });
  });
});
