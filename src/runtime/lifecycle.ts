import {
  AthenaClient,
  StartQueryExecutionCommand,
  type StartQueryExecutionCommandInput,
  type StartQueryExecutionCommandOutput,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  GetQueryRuntimeStatisticsCommand,
  type ResultSet,
  type QueryExecutionStatistics,
} from '@aws-sdk/client-athena';
import {
  AathenaError,
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
} from './errors';
import type { ColumnMeta, QueryStatistics, QueryRuntimeRows } from './types';

const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const DEFAULT_POLL_INTERVAL = 500;
const DEFAULT_MAX_POLL_INTERVAL = 5_000;
const MAX_START_RETRIES = 6;
const START_RETRY_BASE_MS = 500;
const START_RETRY_MAX_MS = 10_000;

interface LifecycleOptions {
  timeout?: number;
  pollingInterval?: number;
  maxPollingInterval?: number;
  includeRuntimeStats?: boolean;
}

export interface QueryOutput {
  queryExecutionId: string;
  columns: ColumnMeta[];
  rows: (string | undefined)[][];
  statistics: QueryStatistics;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConcurrentQueryLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; Reason?: unknown };
  return (
    e.name === 'TooManyRequestsException' &&
    e.Reason === 'CONCURRENT_QUERY_LIMIT_EXCEEDED'
  );
}

async function startWithRetry(
  client: AthenaClient,
  input: StartQueryExecutionCommandInput,
): Promise<StartQueryExecutionCommandOutput> {
  let attempt = 0;
  while (true) {
    try {
      return await client.send(new StartQueryExecutionCommand(input));
    } catch (err) {
      if (!isConcurrentQueryLimitError(err) || attempt >= MAX_START_RETRIES) {
        throw err;
      }
      const backoff = Math.min(
        START_RETRY_BASE_MS * 2 ** attempt,
        START_RETRY_MAX_MS,
      );
      // Full jitter: uniform in [0, backoff]
      const delay = Math.floor(Math.random() * backoff);
      await sleep(delay);
      attempt++;
    }
  }
}

export async function executeQuery(
  client: AthenaClient,
  sql: string,
  database: string,
  workgroup: string | undefined,
  outputLocation: string | undefined,
  options: LifecycleOptions = {},
): Promise<QueryOutput> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const pollInterval = options.pollingInterval ?? DEFAULT_POLL_INTERVAL;
  const maxPollInterval = options.maxPollingInterval ?? DEFAULT_MAX_POLL_INTERVAL;

  // Start query with retry on concurrent-query-limit throttling
  const startResult = await startWithRetry(client, {
    QueryString: sql,
    QueryExecutionContext: { Database: database },
    WorkGroup: workgroup,
    ...(outputLocation && { ResultConfiguration: { OutputLocation: outputLocation } }),
  });

  const queryExecutionId = startResult.QueryExecutionId;
  if (!queryExecutionId) {
    throw new AathenaError('Athena did not return a QueryExecutionId');
  }

  // Poll until complete
  const deadline = Date.now() + timeout;
  let currentInterval = pollInterval;

  while (Date.now() < deadline) {
    await sleep(currentInterval);

    const status = await client.send(
      new GetQueryExecutionCommand({ QueryExecutionId: queryExecutionId }),
    );

    const state = status.QueryExecution?.Status?.State;

    if (state === 'SUCCEEDED') {
      const statistics = buildStatistics(status.QueryExecution?.Statistics);
      if (options.includeRuntimeStats) {
        statistics.runtime = await fetchRuntimeRows(client, queryExecutionId);
      }
      return {
        queryExecutionId,
        ...(await collectResults(client, queryExecutionId)),
        statistics,
      };
    }

    if (state === 'FAILED') {
      throw new QueryFailedError(
        queryExecutionId,
        status.QueryExecution?.Status?.StateChangeReason ?? 'Unknown error',
      );
    }

    if (state === 'CANCELLED') {
      throw new QueryCancelledError(queryExecutionId);
    }

    // Exponential backoff
    currentInterval = Math.min(currentInterval * 1.5, maxPollInterval);
  }

  throw new QueryTimeoutError(queryExecutionId, timeout);
}

function buildStatistics(stats: QueryExecutionStatistics | undefined): QueryStatistics {
  const out: QueryStatistics = {
    engineExecutionTimeInMillis: stats?.EngineExecutionTimeInMillis ?? 0,
    totalExecutionTimeInMillis: stats?.TotalExecutionTimeInMillis ?? 0,
    queryQueueTimeInMillis: stats?.QueryQueueTimeInMillis ?? 0,
    queryPlanningTimeInMillis: stats?.QueryPlanningTimeInMillis ?? 0,
    servicePreProcessingTimeInMillis: stats?.ServicePreProcessingTimeInMillis ?? 0,
    serviceProcessingTimeInMillis: stats?.ServiceProcessingTimeInMillis ?? 0,
    dataScannedInBytes: stats?.DataScannedInBytes ?? 0,
  };
  if (stats?.DpuCount !== undefined) out.dpuCount = stats.DpuCount;
  if (stats?.ResultReuseInformation?.ReusedPreviousResult !== undefined) {
    out.resultReused = stats.ResultReuseInformation.ReusedPreviousResult;
  }
  return out;
}

async function fetchRuntimeRows(
  client: AthenaClient,
  queryExecutionId: string,
): Promise<QueryRuntimeRows | undefined> {
  const result = await client.send(
    new GetQueryRuntimeStatisticsCommand({ QueryExecutionId: queryExecutionId }),
  );
  const rows = result.QueryRuntimeStatistics?.Rows;
  if (!rows) return undefined;
  const out: QueryRuntimeRows = {};
  if (rows.InputRows !== undefined) out.inputRows = rows.InputRows;
  if (rows.InputBytes !== undefined) out.inputBytes = rows.InputBytes;
  if (rows.OutputRows !== undefined) out.outputRows = rows.OutputRows;
  if (rows.OutputBytes !== undefined) out.outputBytes = rows.OutputBytes;
  return out;
}

async function collectResults(
  client: AthenaClient,
  queryExecutionId: string,
): Promise<{ columns: ColumnMeta[]; rows: (string | undefined)[][] }> {
  const columns: ColumnMeta[] = [];
  const rows: (string | undefined)[][] = [];
  let nextToken: string | undefined;
  let isFirstPage = true;

  do {
    const result = await client.send(
      new GetQueryResultsCommand({
        QueryExecutionId: queryExecutionId,
        NextToken: nextToken,
      }),
    );

    const resultSet: ResultSet | undefined = result.ResultSet;

    // Extract column metadata from first page
    if (isFirstPage && resultSet?.ResultSetMetadata?.ColumnInfo) {
      for (const col of resultSet.ResultSetMetadata.ColumnInfo) {
        columns.push({
          name: col.Name ?? '',
          type: col.Type ?? 'varchar',
          nullable: col.Nullable !== 'NOT_NULL',
        });
      }
    }

    // Extract rows (skip header row on first page)
    if (resultSet?.Rows) {
      const startIdx = isFirstPage ? 1 : 0; // first row is header
      for (let i = startIdx; i < resultSet.Rows.length; i++) {
        const row = resultSet.Rows[i];
        rows.push(
          row.Data?.map((d) => d.VarCharValue) ?? [],
        );
      }
    }

    nextToken = result.NextToken;
    isFirstPage = false;
  } while (nextToken);

  return { columns, rows };
}
