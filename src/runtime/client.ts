import { AthenaClient as AwsAthenaClient } from '@aws-sdk/client-athena';
import { executeQuery } from './lifecycle';
import { parseRow } from './parser';
import { loadConfig } from './config';
import type { AathenaConfig, QueryOptions, QueryResult } from './types';

/**
 * Executes queries against Athena. Build one with {@link createClient} rather
 * than calling the constructor, so `aathena.config.json` is found for you.
 */
export class AathenaClient {
  private readonly athena: AwsAthenaClient;
  private readonly _config: AathenaConfig;

  constructor(config: AathenaConfig) {
    this._config = config;
    this.athena = new AwsAthenaClient({
      region: config.region,
    });
  }

  /** The resolved configuration this client was built with. */
  get config(): Readonly<AathenaConfig> {
    return this._config;
  }

  /** The AWS region, or undefined when it is left to the SDK chain. */
  get region(): string | undefined {
    return this._config.region;
  }

  /**
   * Runs an ad-hoc SQL string. Generated query functions are the typed path;
   * reach for this when the SQL is built at runtime.
   *
   * `StartQueryExecution` is retried with exponential backoff and full jitter
   * on `TooManyRequestsException` and `CONCURRENT_QUERY_LIMIT_EXCEEDED`, up to
   * 6 attempts.
   *
   * ```typescript
   * const result = await athena.query<{ id: string }>(
   *   'SELECT id FROM events LIMIT 10',
   *   { includeRuntimeStats: true },
   * );
   * ```
   *
   * @param sql The statement to run. Nothing is escaped for you.
   * @param options Per-call overrides; see {@link QueryOptions}.
   * @throws {QueryTimeoutError} when `query.timeout` elapses first.
   * @throws {QueryFailedError} when Athena reports the query as FAILED.
   * @throws {QueryCancelledError} when the execution was cancelled.
   * @throws {ColumnParseError} when a value does not match its column type.
   */
  async query<T>(sql: string, options: QueryOptions = {}): Promise<QueryResult<T>> {
    const output = await executeQuery(
      this.athena,
      sql,
      options.database ?? this._config.database,
      this._config.workgroup,
      this._config.outputLocation,
      { ...this._config.query, includeRuntimeStats: options.includeRuntimeStats },
    );

    const rows = output.rows.map((row) =>
      parseRow<T>(output.columns, row),
    );

    return {
      rows,
      queryExecutionId: output.queryExecutionId,
      statistics: output.statistics,
    };
  }
}

/**
 * Create an Athena client.
 *
 * - `createClient()` - reads from aathena.config.json automatically
 * - `createClient(config)` - uses the provided config
 */
export function createClient(config?: AathenaConfig): AathenaClient {
  return new AathenaClient(config ?? loadConfig());
}
