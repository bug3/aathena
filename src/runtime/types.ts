export interface AathenaConfig {
  region?: string;
  database: string;
  workgroup?: string;
  outputLocation?: string;
  tablesDir?: string;
  outDir?: string;
  query?: {
    timeout?: number;
    pollingInterval?: number;
    maxPollingInterval?: number;
  };
}

export interface QueryResult<T> {
  rows: T[];
  queryExecutionId: string;
  statistics?: {
    dataScannedInBytes: number;
    engineExecutionTimeInMillis: number;
  };
}

export interface ColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
}
