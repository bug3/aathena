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

export interface QueryRuntimeRows {
  inputRows?: number;
  inputBytes?: number;
  outputRows?: number;
  outputBytes?: number;
}

export interface QueryStatistics {
  // Timing (milliseconds). Athena always reports these on a successful query.
  engineExecutionTimeInMillis: number;
  totalExecutionTimeInMillis: number;
  queryQueueTimeInMillis: number;
  queryPlanningTimeInMillis: number;
  servicePreProcessingTimeInMillis: number;
  serviceProcessingTimeInMillis: number;
  // Data scanned (after partition pruning / projection)
  dataScannedInBytes: number;
  // Only present for capacity-reservation workgroups
  dpuCount?: number;
  // True when Athena served the result from its result cache
  resultReused?: boolean;
  // Populated only when query() is called with { includeRuntimeStats: true }
  runtime?: QueryRuntimeRows;
}

export interface QueryOptions {
  // Issue an extra GetQueryRuntimeStatistics call and surface input/output row counts.
  includeRuntimeStats?: boolean;
}

export interface QueryResult<T> {
  rows: T[];
  queryExecutionId: string;
  statistics: QueryStatistics;
}

export interface ColumnMeta {
  name: string;
  type: string;
  nullable: boolean;
}
