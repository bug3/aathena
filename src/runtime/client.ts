import { AthenaClient as AwsAthenaClient } from '@aws-sdk/client-athena';
import { executeQuery } from './lifecycle';
import { parseRow } from './parser';
import { loadConfig } from './config';
import type { AathenaConfig, QueryResult } from './types';

export class AathenaClient {
  private readonly athena: AwsAthenaClient;
  private readonly config: AathenaConfig;

  constructor(config: AathenaConfig) {
    this.config = config;
    this.athena = new AwsAthenaClient({
      region: config.region,
    });
  }

  async query<T>(sql: string): Promise<QueryResult<T>> {
    const output = await executeQuery(
      this.athena,
      sql,
      this.config.database,
      this.config.workgroup,
      this.config.outputLocation,
      this.config.query,
    );

    const rows = output.rows.map((row) =>
      parseRow<T>(output.columns, row),
    );

    return {
      rows,
      queryExecutionId: output.queryExecutionId,
      statistics: {
        dataScannedInBytes: output.dataScannedInBytes,
        engineExecutionTimeInMillis: output.engineExecutionTimeInMillis,
      },
    };
  }
}

/**
 * Create an Athena client.
 *
 * - `createClient()` — reads from aathena.config.json automatically
 * - `createClient(config)` — uses the provided config
 */
export function createClient(config?: AathenaConfig): AathenaClient {
  return new AathenaClient(config ?? loadConfig());
}
