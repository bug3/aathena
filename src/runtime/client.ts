import { AthenaClient } from '@aws-sdk/client-athena';
import { executeQuery } from './lifecycle';
import { parseRow } from './parser';
import type { AathenaConfig, QueryResult } from './types';

export class AathenaClient {
  private readonly athena: AthenaClient;
  private readonly config: AathenaConfig;

  constructor(config: AathenaConfig) {
    this.config = config;
    this.athena = new AthenaClient({
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

export function createClient(config: AathenaConfig): AathenaClient {
  return new AathenaClient(config);
}
