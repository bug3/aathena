import { AathenaClient } from './client';
import {
  fetchLiveQuota,
  getConservativeFallback,
  type QuotaKind,
} from './limits';

export interface ParallelOptions {
  /**
   * Max number of tasks running at once.
   *   - `number`: explicit cap.
   *   - `'auto'`: resolve from (in order) client.config.maxConcurrency,
   *     live service-quotas lookup, or a region-aware conservative fallback.
   *     Requires { client } when used without maxConcurrency.
   *
   * Default: 5.
   */
  concurrency?: number | 'auto';

  /** Required when `concurrency: 'auto'` is used and maxConcurrency is not set. */
  client?: AathenaClient;

  /** Which quota to probe when resolving 'auto'. Default: 'dml'. */
  kind?: QuotaKind;

  /**
   * Leave headroom for other concurrent workloads (other processes, other
   * Athena users on the same account). Subtracted from the resolved quota.
   * Default: 1.
   */
  reserveHeadroom?: number;

  /**
   * - `'all'` (default): reject on first failure, stop dispatching new tasks.
   * - `'allSettled'`: always resolve, with settlement objects per task.
   */
  mode?: 'all' | 'allSettled';
}

type Thunk<R> = () => Promise<R>;

type AwaitedThunkTuple<T extends readonly Thunk<unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends Thunk<infer R> ? R : never;
};

type SettledThunkTuple<T extends readonly Thunk<unknown>[]> = {
  -readonly [K in keyof T]: T[K] extends Thunk<infer R>
    ? PromiseSettledResult<R>
    : never;
};

/**
 * Run a list of query thunks with a bounded concurrency cap.
 *
 * Tasks MUST be passed as thunks (`() => query(...)`), not already-started
 * promises. A thunk lets the helper delay the actual query dispatch until
 * a worker slot is free; passing `query(...)` directly would fire every
 * query immediately and the cap would be meaningless.
 *
 * @example
 *   const [users, orders] = await parallel(
 *     [
 *       () => getUsers(client, {}),
 *       () => getOrders(client, { from: '2022-02-02' }),
 *     ],
 *     { concurrency: 'auto', client },
 *   );
 */
export async function parallel<const T extends readonly Thunk<unknown>[]>(
  tasks: T,
  options?: ParallelOptions & { mode?: 'all' },
): Promise<AwaitedThunkTuple<T>>;
export async function parallel<const T extends readonly Thunk<unknown>[]>(
  tasks: T,
  options: ParallelOptions & { mode: 'allSettled' },
): Promise<SettledThunkTuple<T>>;
export async function parallel<const T extends readonly Thunk<unknown>[]>(
  tasks: T,
  options: ParallelOptions = {},
): Promise<AwaitedThunkTuple<T> | SettledThunkTuple<T>> {
  const { mode = 'all' } = options;
  const limit = await resolveLimit(options);
  return runBounded(tasks, limit, mode) as Promise<
    AwaitedThunkTuple<T> | SettledThunkTuple<T>
  >;
}

async function resolveLimit(opts: ParallelOptions): Promise<number> {
  const { concurrency = 5, client, kind = 'dml', reserveHeadroom = 1 } = opts;

  if (typeof concurrency === 'number') {
    return Math.max(1, Math.floor(concurrency));
  }

  // concurrency === 'auto'
  const override = client?.config.maxConcurrency;
  if (typeof override === 'number') {
    return Math.max(1, Math.floor(override) - reserveHeadroom);
  }

  if (!client) {
    throw new Error(
      "parallel({ concurrency: 'auto' }) requires { client } when " +
        "aathena.config.json does not specify 'maxConcurrency'.",
    );
  }

  const region = client.region;
  if (!region) {
    throw new Error(
      "parallel({ concurrency: 'auto' }) requires a region on the client " +
        "(set 'region' in aathena.config.json or AWS_REGION).",
    );
  }

  let resolved: number;
  try {
    resolved = await fetchLiveQuota(region, kind);
  } catch {
    resolved = getConservativeFallback(region, kind);
  }

  return Math.max(1, resolved - reserveHeadroom);
}

async function runBounded<R>(
  tasks: readonly Thunk<R>[],
  limit: number,
  mode: 'all' | 'allSettled',
): Promise<unknown[]> {
  if (tasks.length === 0) return [];

  const results = new Array<unknown>(tasks.length);
  const errorBox: { err: unknown } = { err: undefined };
  let hasError = false;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      if (mode === 'all' && hasError) return;
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i]();
        results[i] =
          mode === 'allSettled' ? { status: 'fulfilled', value } : value;
      } catch (err) {
        if (mode === 'allSettled') {
          results[i] = { status: 'rejected', reason: err };
        } else if (!hasError) {
          errorBox.err = err;
          hasError = true;
        }
      }
    }
  };

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  if (mode === 'all' && hasError) {
    throw errorBox.err;
  }
  return results;
}
