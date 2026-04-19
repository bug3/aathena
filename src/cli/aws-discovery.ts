/**
 * Thin wrappers around Glue and Athena discovery APIs used by `aathena init`
 * and `aathena add`. Kept free of prompt/CLI concerns so they're easy to test
 * and reuse.
 */
import {
  GlueClient,
  GetDatabasesCommand,
  GetTableCommand,
  GetTablesCommand,
} from '@aws-sdk/client-glue';
import {
  AthenaClient,
  ListWorkGroupsCommand,
  GetWorkGroupCommand,
} from '@aws-sdk/client-athena';

export interface DatabaseInfo {
  name: string;
  description?: string;
}

export interface TableInfo {
  name: string;
}

export interface WorkGroupInfo {
  name: string;
  state?: string;
  description?: string;
}

export interface WorkGroupDetails {
  name: string;
  outputLocation?: string;
  enforceWorkGroupConfiguration?: boolean;
}

export async function listDatabases(region: string | undefined): Promise<DatabaseInfo[]> {
  const glue = new GlueClient({ region });
  const out: DatabaseInfo[] = [];
  let nextToken: string | undefined;

  do {
    const res = await glue.send(new GetDatabasesCommand({ NextToken: nextToken }));
    for (const d of res.DatabaseList ?? []) {
      if (d.Name) out.push({ name: d.Name, description: d.Description });
    }
    nextToken = res.NextToken;
  } while (nextToken);

  return out;
}

export async function listTables(
  region: string | undefined,
  database: string,
): Promise<TableInfo[]> {
  const glue = new GlueClient({ region });
  const out: TableInfo[] = [];
  let nextToken: string | undefined;

  do {
    const res = await glue.send(
      new GetTablesCommand({ DatabaseName: database, NextToken: nextToken }),
    );
    for (const t of res.TableList ?? []) {
      if (t.Name) out.push({ name: t.Name });
    }
    nextToken = res.NextToken;
  } while (nextToken);

  return out;
}

export async function listWorkGroups(region: string | undefined): Promise<WorkGroupInfo[]> {
  const athena = new AthenaClient({ region });
  const out: WorkGroupInfo[] = [];
  let nextToken: string | undefined;

  do {
    const res = await athena.send(new ListWorkGroupsCommand({ NextToken: nextToken }));
    for (const w of res.WorkGroups ?? []) {
      if (w.Name) {
        out.push({ name: w.Name, state: w.State, description: w.Description });
      }
    }
    nextToken = res.NextToken;
  } while (nextToken);

  return out;
}

export async function getWorkGroupDetails(
  region: string | undefined,
  name: string,
): Promise<WorkGroupDetails> {
  const athena = new AthenaClient({ region });
  const res = await athena.send(new GetWorkGroupCommand({ WorkGroup: name }));
  const wg = res.WorkGroup;
  return {
    name,
    outputLocation: wg?.Configuration?.ResultConfiguration?.OutputLocation,
    enforceWorkGroupConfiguration: wg?.Configuration?.EnforceWorkGroupConfiguration,
  };
}

export function resolveRegion(cliRegion?: string): string | undefined {
  return (
    cliRegion ||
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    undefined
  );
}

export interface RequiredPartition {
  /** Glue column name. */
  name: string;
  /** Glue column type, e.g. 'string', 'int'. Always string-coerced in SQL. */
  type: string;
}

/**
 * Return the partition columns that Athena requires to appear as static
 * equality predicates in every WHERE clause. Only 'injected'-type partition
 * projection columns qualify; other projection types (enum/integer/date)
 * and non-projected partitions can be selected without a predicate.
 *
 * Source: Athena partition projection docs. The CONSTRAINT_VIOLATION
 * error surfaces these columns by name at query time, so scaffolding
 * with the right WHERE saves a round-trip for the user.
 */
export async function fetchRequiredPartitions(
  region: string | undefined,
  database: string,
  tableName: string,
): Promise<RequiredPartition[]> {
  const glue = new GlueClient({ region });
  const res = await glue.send(
    new GetTableCommand({ DatabaseName: database, Name: tableName }),
  );
  const table = res.Table;
  if (!table) return [];

  const params = table.Parameters ?? {};
  if (params['projection.enabled'] !== 'true') return [];

  const out: RequiredPartition[] = [];
  for (const key of table.PartitionKeys ?? []) {
    if (!key.Name) continue;
    const projectionType = params[`projection.${key.Name}.type`];
    if (projectionType === 'injected') {
      out.push({ name: key.Name, type: key.Type ?? 'string' });
    }
  }
  return out;
}
