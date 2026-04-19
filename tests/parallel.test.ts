import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AathenaClient } from '../src/runtime/client';

vi.mock('../src/runtime/limits', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/runtime/limits')>();
  return {
    ...actual,
    fetchLiveQuota: vi.fn(actual.fetchLiveQuota),
  };
});

const { parallel } = await import('../src/runtime/parallel');
const limits = await import('../src/runtime/limits');
const fetchLiveQuotaMock = vi.mocked(limits.fetchLiveQuota);

function makeClient(overrides: Partial<ConstructorParameters<typeof AathenaClient>[0]> = {}) {
  return new AathenaClient({
    database: 'test_db',
    region: 'us-east-1',
    ...overrides,
  });
}

describe('parallel - basic behaviour', () => {
  it('runs all thunks and preserves tuple order + types', async () => {
    const [a, b, c] = await parallel(
      [
        async () => 1 as const,
        async () => 'two' as const,
        async () => true as const,
      ],
      { concurrency: 2 },
    );
    expect(a).toBe(1);
    expect(b).toBe('two');
    expect(c).toBe(true);
  });

  it('returns empty array for empty input', async () => {
    const out = await parallel([] as const, { concurrency: 5 });
    expect(out).toEqual([]);
  });

  it('rejects on first failure in "all" mode', async () => {
    await expect(
      parallel(
        [
          async () => 1,
          async () => {
            throw new Error('boom');
          },
          async () => 3,
        ],
        { concurrency: 1 },
      ),
    ).rejects.toThrow('boom');
  });

  it('returns settlements in "allSettled" mode', async () => {
    const results = await parallel(
      [
        async () => 1,
        async () => {
          throw new Error('boom');
        },
      ],
      { concurrency: 2, mode: 'allSettled' },
    );
    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1]).toMatchObject({ status: 'rejected' });
  });
});

describe('parallel - concurrency cap', () => {
  it('never exceeds the configured limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const makeTask = () => async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return 'ok';
    };

    await parallel(
      Array.from({ length: 10 }, makeTask),
      { concurrency: 3 },
    );

    expect(peak).toBeLessThanOrEqual(3);
  });

  it('floors fractional concurrency and enforces minimum of 1', async () => {
    let peak = 0;
    let inFlight = 0;
    await parallel(
      Array.from({ length: 5 }, () => async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      }),
      { concurrency: 0 }, // clamped to 1
    );
    expect(peak).toBe(1);
  });
});

describe("parallel - concurrency: 'auto'", () => {
  beforeEach(() => {
    limits._clearQuotaCache();
    fetchLiveQuotaMock.mockReset();
  });

  it('uses config.maxConcurrency when set (no fetch, no fallback)', async () => {
    const client = makeClient({ maxConcurrency: 4 });
    let peak = 0;
    let inFlight = 0;
    await parallel(
      Array.from({ length: 8 }, () => async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
      }),
      { concurrency: 'auto', client, reserveHeadroom: 0 },
    );
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('applies reserveHeadroom on maxConcurrency', async () => {
    const client = makeClient({ maxConcurrency: 5 });
    let peak = 0;
    let inFlight = 0;
    await parallel(
      Array.from({ length: 10 }, () => async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight--;
      }),
      { concurrency: 'auto', client, reserveHeadroom: 2 }, // effective = 3
    );
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('throws when client missing', async () => {
    await expect(
      parallel([async () => 1], { concurrency: 'auto' }),
    ).rejects.toThrow(/requires \{ client \}/);
  });

  it('throws when region missing and no maxConcurrency', async () => {
    const client = new AathenaClient({ database: 'x' }); // no region
    await expect(
      parallel([async () => 1], { concurrency: 'auto', client }),
    ).rejects.toThrow(/requires a region/);
  });

  it('falls back to conservative region table when live fetch fails', async () => {
    // sa-east-1 documented default=20 → conservative fallback=10
    const client = makeClient({ region: 'sa-east-1' });
    fetchLiveQuotaMock.mockRejectedValueOnce(new Error('simulated AccessDenied'));

    let peak = 0;
    let inFlight = 0;
    await parallel(
      Array.from({ length: 20 }, () => async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      }),
      { concurrency: 'auto', client, reserveHeadroom: 0 },
    );

    expect(peak).toBeLessThanOrEqual(10);
  });

  it('uses live quota when fetch succeeds', async () => {
    const client = makeClient({ region: 'us-east-1' });
    fetchLiveQuotaMock.mockResolvedValueOnce(6);

    let peak = 0;
    let inFlight = 0;
    await parallel(
      Array.from({ length: 15 }, () => async () => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
      }),
      { concurrency: 'auto', client, reserveHeadroom: 0 },
    );

    expect(peak).toBeLessThanOrEqual(6);
  });
});
