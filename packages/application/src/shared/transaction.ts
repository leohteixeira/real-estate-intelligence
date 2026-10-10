/**
 * Opaque application transaction scope.
 *
 * Infrastructure adapters subclass this type to retain their private handle;
 * application services can only pass the scope to other application ports.
 */
export abstract class Transaction {
  protected readonly transactionScope = 'rei.Transaction' as const;

  protected constructor() {}
}

export type TransactionWork<TResult> = (transaction: Transaction) => Promise<TResult>;

/** Runs one application operation inside one atomic persistence transaction. */
export interface TransactionRunner {
  runInTransaction<TResult>(work: TransactionWork<TResult>, signal?: AbortSignal): Promise<TResult>;
}

export const TRANSACTION_RUNNER = Symbol.for('rei.TransactionRunner');
