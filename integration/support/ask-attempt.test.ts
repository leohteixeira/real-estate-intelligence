import { expect, test, vi } from 'vitest';
import { runAskAttempt } from './ask-attempt.ts';

test.each([undefined, null, false, 0, ''])(
  'preserves falsy action failure %j and records a failed attempt',
  async (primary) => {
    const report = vi.fn();
    const work = runAskAttempt(
      async () => {
        throw primary;
      },
      {
        captures: [{ name: 'readback.json', run: async () => undefined }],
        report,
      },
    );
    await expect(work).rejects.toBe(primary);
    expect(report).toHaveBeenCalledWith({
      failed: true,
      actionFailed: true,
      produced: ['readback.json'],
    });
  },
);

test('failed work and a closed page screenshot still attempt readback/environment and ledger', async () => {
  const primary = new Error('action failed'),
    screenshot = new Error('page closed');
  const calls: string[] = [];
  const work = runAskAttempt(
    async () => {
      throw primary;
    },
    {
      captures: [
        {
          name: 'final.png',
          run: async () => {
            calls.push('screenshot');
            throw screenshot;
          },
        },
        {
          name: 'readback.json',
          run: async () => {
            calls.push('readback');
          },
        },
        {
          name: 'environment.json',
          run: async () => {
            calls.push('environment');
          },
        },
      ],
      report: async (outcome) => {
        calls.push('ledger');
        expect(outcome).toEqual({
          failed: true,
          actionFailed: true,
          produced: ['readback.json', 'environment.json'],
        });
      },
    },
  );
  await expect(work).rejects.toMatchObject({ errors: [primary, { errors: [screenshot] }] });
  expect(calls).toEqual(['screenshot', 'readback', 'environment', 'ledger']);
});

test('preserves primary, multiple capture/write errors and ledger failure together', async () => {
  const primary = new Error('action'),
    screenshot = new Error('screenshot'),
    readback = new Error('readback write'),
    environment = new Error('environment write'),
    ledger = new Error('ledger write');
  const report = vi.fn(async () => {
    throw ledger;
  });
  const work = runAskAttempt(
    async () => {
      throw primary;
    },
    {
      captures: [
        {
          name: 'final.png',
          run: async () => {
            throw screenshot;
          },
        },
        {
          name: 'readback.json',
          run: async () => {
            throw readback;
          },
        },
        {
          name: 'environment.json',
          run: async () => {
            throw environment;
          },
        },
      ],
      report,
    },
  );
  await expect(work).rejects.toMatchObject({
    errors: [primary, { errors: [{ errors: [screenshot, readback, environment] }, ledger] }],
  });
  expect(report).toHaveBeenCalledWith({ failed: true, actionFailed: true, produced: [] });
});

test('successful action with failed required evidence is never approved', async () => {
  const failure = new Error('screenshot'),
    report = vi.fn();
  await expect(
    runAskAttempt(async () => undefined, {
      captures: [
        {
          name: 'final.png',
          run: async () => {
            throw failure;
          },
        },
      ],
      report,
    }),
  ).rejects.toMatchObject({ errors: [failure] });
  expect(report).toHaveBeenCalledWith({ failed: true, actionFailed: false, produced: [] });
});

test('only successful action and all required captures permit an approved ledger entry', async () => {
  const report = vi.fn();
  await runAskAttempt(async () => undefined, {
    captures: [{ name: 'final.png', run: async () => undefined }],
    report,
  });
  expect(report).toHaveBeenCalledWith({
    failed: false,
    actionFailed: false,
    produced: ['final.png'],
  });
});
