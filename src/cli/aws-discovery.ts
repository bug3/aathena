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

export interface PartitionProbeResult {
  /** Required partition columns, deduped across any traversed views. */
  partitions: RequiredPartition[];
  /**
   * Human-readable notes from the probe. Non-empty when we crossed a view,
   * could not parse a reference, or hit the depth / cycle safeguard. init
   * and add surface these to the user so an incomplete trace is never
   * silent.
   */
  notes: string[];
}

const MAX_VIEW_DEPTH = 3;

/**
 * Return the partition columns that Athena requires to appear as static
 * equality predicates in every WHERE clause. Only 'injected'-type partition
 * projection columns qualify; other projection types (enum/integer/date)
 * and non-projected partitions can be selected without a predicate.
 *
 * When the target is a Presto/Trino view, its ViewOriginalText is decoded
 * and the referenced tables are probed recursively (up to MAX_VIEW_DEPTH
 * levels, with a visited set to defuse cycles). The union of required
 * partitions is returned. If parsing or traversal fails, a note is added
 * to the result so the caller can warn the user.
 */
export async function fetchRequiredPartitions(
  region: string | undefined,
  database: string,
  tableName: string,
): Promise<PartitionProbeResult> {
  const glue = new GlueClient({ region });
  const partitions = new Map<string, RequiredPartition>();
  const notes: string[] = [];
  const visited = new Set<string>();
  await probePartitions(
    glue,
    database,
    tableName,
    0,
    partitions,
    notes,
    visited,
  );
  return { partitions: [...partitions.values()], notes };
}

async function probePartitions(
  glue: GlueClient,
  database: string,
  tableName: string,
  depth: number,
  partitions: Map<string, RequiredPartition>,
  notes: string[],
  visited: Set<string>,
): Promise<void> {
  const key = `${database}.${tableName}`;
  if (visited.has(key)) return;
  visited.add(key);

  if (depth > MAX_VIEW_DEPTH) {
    notes.push(
      `View depth limit exceeded at '${key}'; add any remaining WHERE predicates by hand.`,
    );
    return;
  }

  let table;
  try {
    const res = await glue.send(
      new GetTableCommand({ DatabaseName: database, Name: tableName }),
    );
    table = res.Table;
  } catch (err) {
    notes.push(
      `Could not fetch '${key}': ${(err as Error).message}.`,
    );
    return;
  }
  if (!table) return;

  if (isViewTable(table)) {
    const refs = extractViewReferences(table.ViewOriginalText, database);
    if (refs.length === 0) {
      notes.push(
        `Table '${key}' is a view but its references could not be parsed; add WHERE predicates manually if queries fail.`,
      );
      return;
    }
    notes.push(
      `View '${key}' traced to: ${refs.map((r) => `${r.database}.${r.tableName}`).join(', ')}`,
    );
    for (const ref of refs) {
      await probePartitions(
        glue,
        ref.database,
        ref.tableName,
        depth + 1,
        partitions,
        notes,
        visited,
      );
    }
    return;
  }

  const params = table.Parameters ?? {};
  if (params['projection.enabled'] !== 'true') return;

  for (const pk of table.PartitionKeys ?? []) {
    if (!pk.Name) continue;
    const projectionType = params[`projection.${pk.Name}.type`];
    if (projectionType === 'injected' && !partitions.has(pk.Name)) {
      partitions.set(pk.Name, { name: pk.Name, type: pk.Type ?? 'string' });
    }
  }
}

function isViewTable(table: {
  TableType?: string;
  Parameters?: Record<string, string>;
}): boolean {
  if (table.TableType === 'VIRTUAL_VIEW') return true;
  const params = table.Parameters ?? {};
  return params.presto_view === 'true' || params.trino_view === 'true';
}

/**
 * Decode a Glue ViewOriginalText and return the referenced tables.
 * Presto/Trino views embed the view definition as a base64-encoded JSON
 * blob inside a comment marker ("Presto View: <base64>"); we decode that
 * when present, otherwise scan the raw text as SQL. Bare table names are
 * resolved against `defaultDatabase`. Exported for testability.
 */
export function extractViewReferences(
  viewOriginalText: string | undefined,
  defaultDatabase: string,
): Array<{ database: string; tableName: string }> {
  if (!viewOriginalText) return [];

  let sql = viewOriginalText;
  const marker = viewOriginalText.match(
    /Presto View:\s*([A-Za-z0-9+/=]+)/,
  );
  if (marker) {
    try {
      const decoded = Buffer.from(marker[1], 'base64').toString('utf-8');
      const parsed = JSON.parse(decoded) as { originalSql?: unknown };
      if (typeof parsed.originalSql === 'string') {
        sql = parsed.originalSql;
      }
    } catch {
      // Fall back to scanning the raw text.
    }
  }

  return findTableRefsInSql(sql, defaultDatabase);
}

/**
 * Extract FROM/JOIN table references from a SQL string. Handles bare,
 * two-part (db.table), and three-part (catalog.db.table) identifiers
 * plus double-quoted names. Strings and comments are stripped first to
 * reduce false positives. Exported for testability.
 */
export function findTableRefsInSql(
  sql: string,
  defaultDatabase: string,
): Array<{ database: string; tableName: string }> {
  const stripped = sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

  const IDENT = `(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_]*)`;
  const pattern = new RegExp(
    `\\b(?:FROM|JOIN)\\s+(${IDENT})(?:\\.(${IDENT}))?(?:\\.(${IDENT}))?`,
    'gi',
  );

  const refs = new Map<string, { database: string; tableName: string }>();
  for (const match of stripped.matchAll(pattern)) {
    const parts = [match[1], match[2], match[3]]
      .filter((v): v is string => Boolean(v))
      .map(unquoteIdent);
    let database: string;
    let tableName: string;
    if (parts.length === 3) {
      // catalog.database.table: drop the catalog
      database = parts[1];
      tableName = parts[2];
    } else if (parts.length === 2) {
      database = parts[0];
      tableName = parts[1];
    } else {
      database = defaultDatabase;
      tableName = parts[0];
    }
    refs.set(`${database}.${tableName}`, { database, tableName });
  }
  return [...refs.values()];
}

function unquoteIdent(s: string): string {
  return s.startsWith('"') && s.endsWith('"') ? s.slice(1, -1) : s;
}
