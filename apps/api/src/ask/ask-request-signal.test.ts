import { EventEmitter } from 'node:events';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { askRequestWork } from './ask-request-signal';
function request() {
  return Object.assign(new EventEmitter(), {
    res: Object.assign(new EventEmitter(), { writableEnded: false, destroyed: false }),
    aborted: false,
  });
}
describe('Ask HTTP mutation cancellation lifetime', () => {
  it('removes request/response listeners after success or failure', async () => {
    const req = request();
    await expect(askRequestWork(req as unknown as Request, async () => 42)).resolves.toBe(42);
    expect(req.listenerCount('aborted')).toBe(0);
    expect(req.res.listenerCount('close')).toBe(0);
    await expect(
      askRequestWork(req as unknown as Request, async () => {
        throw new Error('failure');
      }),
    ).rejects.toThrow('failure');
    expect(req.listenerCount('aborted')).toBe(0);
    expect(req.res.listenerCount('close')).toBe(0);
  });
  it('aborts disconnects but not normal completed response closes', async () => {
    const req = request();
    await askRequestWork(req as unknown as Request, async (signal) => {
      req.res.emit('close');
      expect(signal.aborted).toBe(true);
    });
    req.res.writableEnded = true;
    await askRequestWork(req as unknown as Request, async (signal) => {
      req.res.emit('close');
      expect(signal.aborted).toBe(false);
    });
    await askRequestWork(req as unknown as Request, async (signal) => {
      req.emit('aborted');
      expect(signal.aborted).toBe(true);
    });
  });
});
