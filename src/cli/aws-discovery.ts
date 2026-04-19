/**
 * Thin wrappers around Glue and Athena discovery APIs used by `aathena init`
 * and `aathena add`. Kept free of prompt/CLI concerns so they're easy to test
 * and reuse.
 */
import {
  GlueClient,
  GetDatabasesCommand,
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
