import { NestFactory } from '@nestjs/core';
import { EnableSource, type EnableSourceResult } from '@rei/application';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shutdownTelemetry } from '../otel';
import {
  executeSourceEnable,
  parseSourceEnableArguments,
  runSourceEnableCommand,
  SourceEnableCommandError,
} from './enable-source-command';
import { SourceRegisterCommandModule } from './source-register-command.module';

vi.mock('@nestjs/core', () => ({
  NestFactory: { createApplicationContext: vi.fn() },
}));
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn() }));

function service(result: EnableSourceResult): EnableSource {
  return { execute: vi.fn(async () => result) } as unknown as EnableSource;
}

function commandContext(result: EnableSourceResult) {
  const enable = service(result);
  const close = vi.fn(async (): Promise<void> => undefined);
  vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
    get: () => enable,
    close,
  } as never);
  return { enable, close };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(shutdownTelemetry).mockResolvedValue(undefined);
});

describe('source enable command', () => {
  it.each([
    [['node', 'command'], 'exactly one source ID'],
    [['node', 'command', 'one', 'two'], 'exactly one source ID'],
    [['node', 'command', '--force'], 'must not be an option'],
    [['node', 'command', 'Not Valid'], 'lower-kebab'],
  ])('rejects unsafe arguments before bootstrap', (argv, message) => {
    expect(() => parseSourceEnableArguments(argv)).toThrow(message);
  });

  it('accepts one lower-kebab source ID', () => {
    expect(parseSourceEnableArguments(['node', 'command', 'approved-source'])).toBe(
      'approved-source',
    );
  });

  it.each([
    [{ status: 'not-found', sourceId: 'missing-source' } as const, 'was not found'],
    [
      {
        status: 'refused',
        sourceId: 'blocked-source',
        reason: 'review-forbidden',
      } as const,
      'review-forbidden',
    ],
  ])('turns %s into a bounded operator failure', async (result, message) => {
    await expect(
      executeSourceEnable(service(result), result.sourceId, new AbortController().signal),
    ).rejects.toEqual(expect.any(SourceEnableCommandError));
    await expect(
      executeSourceEnable(service(result), result.sourceId, new AbortController().signal),
    ).rejects.toThrow(message);
  });

  it('reports successful and repeated enablement without policy evidence', async () => {
    const enabled = {
      sourceId: 'approved-source',
      displayLabel: 'Approved',
      category: 'listing',
      enabled: true,
      enabledAt: '2026-10-10T00:00:00Z',
      permissions: {
        collectionAllowed: true,
        imageFetchingAllowed: false,
        listingTextDisplayAllowed: false,
      },
      review: {
        outcome: 'allowed',
        reviewedAt: '2026-10-09T00:00:00Z',
        evidence: 'private evidence',
      },
      access: { method: 'remote-http', detail: 'private access policy' },
      rate: { status: 'configured', limit: 1, windowSeconds: 60 },
      licence: { status: 'licensed', label: 'Open', url: 'https://example.invalid' },
    } as const;
    for (const status of ['enabled', 'already-enabled'] as const) {
      await expect(
        executeSourceEnable(
          service({ status, source: enabled }),
          'approved-source',
          new AbortController().signal,
        ),
      ).resolves.toMatchObject({ status });
    }
  });

  it('preserves cancellation from the application service', async () => {
    const reason = new Error('cancelled');
    const enable = {
      execute: vi.fn(async () => {
        throw reason;
      }),
    } as unknown as EnableSource;
    await expect(
      executeSourceEnable(enable, 'approved-source', new AbortController().signal),
    ).rejects.toBe(reason);
  });

  it('closes Nest and telemetry after a successful command', async () => {
    const { close } = commandContext({
      status: 'already-enabled',
      source: {
        sourceId: 'synthetic-data',
        displayLabel: 'Labelled synthetic fixture',
        category: 'synthetic-listing',
        enabled: true,
        enabledAt: '2026-10-10T00:00:00Z',
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        },
        review: { outcome: 'not-required', reviewedAt: null, evidence: 'Fixture.' },
        access: { method: 'repository-fixture', detail: 'Checked-in fixture.' },
        rate: { status: 'not-applicable', limit: null, windowSeconds: null },
        licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
      },
    });

    await runSourceEnableCommand(['node', 'command', 'synthetic-data']);

    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('preserves an operation failure while attempting both cleanup paths', async () => {
    const primary = new Error('database operation failed');
    const close = vi.fn(async () => {
      throw new Error('Nest close failed');
    });
    vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
      get: () => ({ execute: vi.fn(async () => Promise.reject(primary)) }),
      close,
    } as never);
    vi.mocked(shutdownTelemetry).mockRejectedValue(new Error('telemetry cleanup failed'));

    await expect(runSourceEnableCommand(['node', 'command', 'approved-source'])).rejects.toBe(
      primary,
    );
    expect(close).toHaveBeenCalledOnce();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it.each(['SIGINT', 'SIGTERM'] as const)(
    'propagates %s cancellation and still closes owned resources',
    async (signalName) => {
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const execute = vi.fn(
        async (_sourceId: string, signal: AbortSignal) =>
          new Promise<never>((_resolve, reject) => {
            started();
            signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          }),
      );
      const close = vi.fn(async (): Promise<void> => undefined);
      vi.mocked(NestFactory.createApplicationContext).mockResolvedValue({
        get: () => ({ execute }),
        close,
      } as never);

      const command = runSourceEnableCommand(['node', 'command', 'approved-source']);
      await ready;
      process.emit(signalName, signalName);

      await expect(command).rejects.toThrow('source enable command was cancelled');
      expect(close).toHaveBeenCalledOnce();
      expect(shutdownTelemetry).toHaveBeenCalledOnce();
    },
  );

  it('does not bootstrap Nest for invalid arguments but still shuts telemetry down', async () => {
    await expect(runSourceEnableCommand(['node', 'command'])).rejects.toThrow(
      'exactly one source ID',
    );
    expect(NestFactory.createApplicationContext).not.toHaveBeenCalled();
    expect(shutdownTelemetry).toHaveBeenCalledOnce();
  });

  it('keeps the command module database-only', () => {
    const imports = Reflect.getMetadata('imports', SourceRegisterCommandModule) as readonly {
      readonly name?: string;
      readonly module?: { readonly name?: string };
    }[];
    const names = imports.map((entry) => entry.name ?? entry.module?.name).filter(Boolean);
    expect(imports).toHaveLength(2);
    expect(names).toEqual(['PersistenceModule']);
    expect(names.join(' ')).not.toMatch(/S3|Rabbit|ListingSource|CollectionCommand/);
  });
});
