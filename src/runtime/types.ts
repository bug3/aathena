export interface AathenaConfig {
  region?: string;
  database: string;
  workgroup?: string;
  outputLocation?: string;
  tablesDir?: string;
  outDir?: string;
  codegen?: {
    // Number of spaces used to indent generated TypeScript files. Defaults to
    // 2, which matches Prettier and the broader TS ecosystem (Google, Airbnb,
    // Angular, NestJS templates).
    indent?: number;
  };
  query?: {
    timeout?: number;
    pollingInterval?: number;
    maxPollingInterval?: number;
  };
  // Manual override for parallel({ concurrency: 'auto' }) when service-quotas
  // is unreachable. When set, takes precedence over the live quota lookup and
  // the region-based fallback table.
  maxConcurrency?: number;
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
  // Override the execution context database for this call. Takes precedence over
  // AathenaConfig.database. Used by generated queries whose directory database
  // differs from the project's primary database.
  database?: string;
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
