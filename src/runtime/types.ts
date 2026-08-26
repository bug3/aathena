// #region config
/**
 * Project configuration, read from `aathena.config.json` at the project root.
 *
 * `createClient()` finds and loads it by walking up from the working
 * directory. Pass a config to `createClient(config)` to skip the file
 * entirely, which is what tests and bundled deploys want.
 */
export interface AathenaConfig {
  /** AWS region. Falls back to the standard AWS SDK resolution chain. */
  region?: string;
  /**
   * Primary Athena database. Used for every query whose directory does not
   * name a different one.
   */
  database: string;
  /** Athena workgroup. Its default output location is used when set. */
  workgroup?: string;
  /**
   * S3 path for query results, for example `s3://bucket/prefix/`. Optional
   * when the workgroup already defines one.
   */
  outputLocation?: string;
  /** Where your SQL files live. Defaults to `./tables`. */
  tablesDir?: string;
  /** Where codegen writes. Defaults to `./generated`. */
  outDir?: string;
  codegen?: {
    /**
     * Number of spaces used to indent generated TypeScript files. Defaults to
     * 2, which matches Prettier and the broader TS ecosystem (Google, Airbnb,
     * Angular, NestJS templates). Values outside `[1, 8]` are clamped.
     */
    indent?: number;
  };
  query?: {
    /** How long to wait for a query before giving up, in ms. Defaults to 300000. */
    timeout?: number;
    /** First poll interval, in ms. Defaults to 500, then backs off. */
    pollingInterval?: number;
    /** Ceiling for the backing-off poll interval, in ms. Defaults to 5000. */
    maxPollingInterval?: number;
  };
  /**
   * Manual override for `parallel({ concurrency: 'auto' })` when service-quotas
   * is unreachable. When set, takes precedence over the live quota lookup and
   * the region-based fallback table.
   */
  maxConcurrency?: number;
}
// #endregion config

/**
 * Row and byte counts for a query. Present on {@link QueryStatistics.runtime}
 * only when `query()` was called with `{ includeRuntimeStats: true }`.
 */
export interface QueryRuntimeRows {
  /** Rows read from the source, before filtering. */
  inputRows?: number;
  /** Bytes read from the source. */
  inputBytes?: number;
  /** Rows the query returned. */
  outputRows?: number;
  /** Bytes the query returned. */
  outputBytes?: number;
}

// #region statistics
/**
 * What Athena reports about an execution. Every {@link QueryResult} carries
 * one. `dataScannedInBytes` is what drives the bill.
 */
export interface QueryStatistics {
  /** Engine execution time, in ms. */
  engineExecutionTimeInMillis: number;
  /** Wall time Athena took, in ms. */
  totalExecutionTimeInMillis: number;
  /** Time spent waiting in the queue, in ms. */
  queryQueueTimeInMillis: number;
  /** Planning and partition retrieval, in ms. */
  queryPlanningTimeInMillis: number;
  /** Preprocessing before the engine ran, in ms. */
  servicePreProcessingTimeInMillis: number;
  /** Result publication, in ms. */
  serviceProcessingTimeInMillis: number;
  /** Bytes scanned after partition pruning and projection. This is the cost. */
  dataScannedInBytes: number;
  /** Only present for capacity-reservation workgroups. */
  dpuCount?: number;
  /** True when Athena served the result from its result cache. */
  resultReused?: boolean;
  /** Populated only when `query()` is called with `{ includeRuntimeStats: true }`. */
  runtime?: QueryRuntimeRows;
}
// #endregion statistics

/** Per-call options for {@link AathenaClient.query} and generated queries. */
export interface QueryOptions {
  /**
   * Issue an extra `GetQueryRuntimeStatistics` call and surface input/output
   * row counts on {@link QueryStatistics.runtime}. Costs one API call, so
   * leave it off in hot paths.
   */
  includeRuntimeStats?: boolean;
  /**
   * Override the execution context database for this call. Takes precedence
   * over {@link AathenaConfig.database}. Codegen sets it for queries whose
   * directory database differs from the project's primary database.
   */
  database?: string;
}

/**
 * What a query returns. `T` is the row type, which codegen derives from the
 * Glue catalog.
 */
export interface QueryResult<T> {
  /** The parsed rows. Column names are exactly as Glue reports them. */
  rows: T[];
  /** Athena's id for this execution, useful for tracing and error reports. */
  queryExecutionId: string;
  /** Timings, bytes scanned and cache status. */
  statistics: QueryStatistics;
}

/** One column as Athena described it in the result metadata. */
export interface ColumnMeta {
  /** Column name, verbatim from the catalog. */
  name: string;
  /** Athena type name, for example `varchar` or `array<int>`. */
  type: string;
  /** False only for partition keys, which Athena guarantees `NOT NULL`. */
  nullable: boolean;
}
