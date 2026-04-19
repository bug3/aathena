import { AthenaClient as AwsAthenaClient } from '@aws-sdk/client-athena';
import { executeQuery } from './lifecycle';
import { parseRow } from './parser';
import { loadConfig } from './config';
import type { AathenaConfig, QueryOptions, QueryResult } from './types';

export class AathenaClient {
  private readonly athena: AwsAthenaClient;
  private readonly _config: AathenaConfig;

  constructor(config: AathenaConfig) {
    this._config = config;
    this.athena = new AwsAthenaClient({
      region: config.region,
    });
  }

  get config(): Readonly<AathenaConfig> {
    return this._config;
  }

  get region(): string | undefined {
    return this._config.region;
  }

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
