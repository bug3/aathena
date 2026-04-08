import {
  GlueClient,
  GetTableCommand,
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
  nullable: boolean;
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
    .map((col) => mapColumn(col, true));

  // Partition keys are NOT NULL in Athena
  const partitionKeys = (result.Table?.PartitionKeys ?? [])
    .map((col) => mapColumn(col, false));

  return {
    database,
    tableName,
    columns: [...columns, ...partitionKeys],
  };
}

function mapColumn(col: Column, nullable: boolean): GlueColumn {
  return {
    name: col.Name ?? '',
    type: col.Type ?? 'string',
    comment: col.Comment,
    nullable,
  };
}
