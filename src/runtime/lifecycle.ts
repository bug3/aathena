import {
  AthenaClient,
  StartQueryExecutionCommand,
  GetQueryExecutionCommand,
  GetQueryResultsCommand,
  type ResultSet,
} from '@aws-sdk/client-athena';
import {
  AathenaError,
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
} from './errors';
import type { ColumnMeta } from './types';

const DEFAULT_TIMEOUT = 300_000; // 5 minutes
const DEFAULT_POLL_INTERVAL = 500;
const DEFAULT_MAX_POLL_INTERVAL = 5_000;

interface LifecycleOptions {
  timeout?: number;
  pollingInterval?: number;
  maxPollingInterval?: number;
}

export interface QueryOutput {
  queryExecutionId: string;
  columns: ColumnMeta[];
  rows: (string | undefined)[][];
  dataScannedInBytes: number;
  engineExecutionTimeInMillis: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeQuery(
  client: AthenaClient,
  sql: string,
  database: string,
  workgroup: string | undefined,
  outputLocation: string,
  options: LifecycleOptions = {},
): Promise<QueryOutput> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const pollInterval = options.pollingInterval ?? DEFAULT_POLL_INTERVAL;
  const maxPollInterval = options.maxPollingInterval ?? DEFAULT_MAX_POLL_INTERVAL;

  // Start query
  const startResult = await client.send(
    new StartQueryExecutionCommand({
      QueryString: sql,
      QueryExecutionContext: { Database: database },
      WorkGroup: workgroup,
      ResultConfiguration: { OutputLocation: outputLocation },
    }),
  );

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
      const stats = status.QueryExecution?.Statistics;
      return {
        queryExecutionId,
        ...(await collectResults(client, queryExecutionId)),
        dataScannedInBytes: stats?.DataScannedInBytes ?? 0,
        engineExecutionTimeInMillis: stats?.EngineExecutionTimeInMillis ?? 0,
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
