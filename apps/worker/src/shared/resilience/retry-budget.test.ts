import { describe, expect, it, vi } from 'vitest';

import { RetryBudget } from './retry-budget';

describe('RetryBudget', () => {
  it('keeps a low-traffic reserve and otherwise caps retries at ten percent of calls', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const budget = new RetryBudget({ windowMs: 60_000, ratio: 0.1, lowTrafficReserve: 1 });

    budget.recordCall();
    expect(budget.tryTake()).toBe(true);
    expect(budget.tryTake()).toBe(false);
    for (let index = 0; index < 99; index += 1) budget.recordCall();
    expect(budget.state).toEqual({ calls: 100, retries: 1, allowance: 10 });
    for (let index = 0; index < 9; index += 1) expect(budget.tryTake()).toBe(true);
    expect(budget.tryTake()).toBe(false);
    vi.useRealTimers();
  });

  it('restores capacity when the rolling window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const budget = new RetryBudget({ windowMs: 60_000, ratio: 0.1, lowTrafficReserve: 1 });
    budget.recordCall();
    expect(budget.tryTake()).toBe(true);

    vi.setSystemTime(60_001);
    budget.recordCall();
    expect(budget.tryTake()).toBe(true);
    vi.useRealTimers();
  });
});
