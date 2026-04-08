import {
  GlueClient,
  GetTableCommand,
  GetTablesCommand,
  type Column,
} from '@aws-sdk/client-glue';

export interface TableSchema {
  database: string;
  tableName: string;
  columns: GlueColumn[];
}

export interface GlueColumn {
  name: string;
  type: string;
  comment?: string;
}

export async function fetchTableSchema(
  region: string | undefined,
  database: string,
  tableName: string,
): Promise<TableSchema> {
  const glue = new GlueClient({ region });

  const result = await glue.send(
    new GetTableCommand({
      DatabaseName: database,
      Name: tableName,
    }),
  );

  const columns: GlueColumn[] = (result.Table?.StorageDescriptor?.Columns ?? [])
    .map(mapColumn);

  // Include partition keys as columns too
  const partitionKeys = (result.Table?.PartitionKeys ?? [])
    .map(mapColumn);

  return {
    database,
    tableName,
    columns: [...columns, ...partitionKeys],
  };
}

export async function fetchAllTables(
  region: string | undefined,
  database: string,
): Promise<string[]> {
  const glue = new GlueClient({ region });
  const tableNames: string[] = [];
  let nextToken: string | undefined;

  do {
    const result = await glue.send(
      new GetTablesCommand({
        DatabaseName: database,
        NextToken: nextToken,
      }),
    );

    for (const table of result.TableList ?? []) {
      if (table.Name) tableNames.push(table.Name);
    }

    nextToken = result.NextToken;
  } while (nextToken);

  return tableNames;
}

function mapColumn(col: Column): GlueColumn {
  return {
    name: col.Name ?? '',
    type: col.Type ?? 'string',
    comment: col.Comment,
  };
}
