import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import * as p from '@clack/prompts';
import type { AathenaConfig } from '../../runtime/types';
import { findProjectRoot } from '../../runtime/config';
import { fetchTableSchema, type GlueColumn } from '../../codegen/glue-fetcher';
import { generate } from '../../codegen/generate';
import {
  resolveRegion,
  fetchRequiredPartitions,
  type RequiredPartition,
} from '../aws-discovery';

export interface AddFlags {
  name?: string;
  fromSchema?: boolean;
  noGenerate?: boolean;
  force?: boolean;
}

const CONFIG_FILE = 'aathena.config.json';

export async function runAdd(
  cwd: string,
  target: string | undefined,
  flags: AddFlags,
): Promise<number> {
  let projectRoot: string;
  try {
    projectRoot = findProjectRoot(cwd);
  } catch {
    p.log.error(
      `No ${CONFIG_FILE} found in ${cwd} or any parent directory. Run 'aathena init' first.`,
    );
    return 1;
  }
  const configPath = resolve(projectRoot, CONFIG_FILE);

  if (!target) {
    p.log.error('Usage: aathena add <table> [--name <query-name>] [--from-schema]');
    return 1;
  }

  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as AathenaConfig;
  const parsed = parseTarget(target, config.database);
  if (!parsed) {
    p.log.error(`Invalid target '${target}'. Use 'table' or 'database.table'.`);
    return 1;
  }

  const tablesDirRel = normalizeRelativeDir(config.tablesDir ?? 'tables');

  p.intro('aathena add');

  const { database, tableName } = parsed;
  if (database !== config.database) {
    const resolution = await p.select({
      message: `'${database}' differs from config.database '${config.database}'. What should we do?`,
      initialValue: 'bind' as const,
      options: [
        {
          value: 'bind',
          label: 'Scaffold under this database with per-query binding',
          hint: `${tablesDirRel}/${database}/${tableName}/, runtime uses ${database}`,
        },
        {
          value: 'switch',
          label: `Switch config.database to '${database}'`,
          hint: 'Updates aathena.config.json',
        },
        { value: 'cancel', label: 'Cancel' },
      ],
    });
    if (p.isCancel(resolution) || resolution === 'cancel') {
      p.cancel('Cancelled.');
      return 1;
    }
    if (resolution === 'switch') {
      config.database = database;
      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      p.log.success(`Switched config.database to '${database}'`);
    }
    // 'bind' needs no config change; codegen emits { database } automatically
    // because directory database differs from config.database.
  }

  const queryName = flags.name ?? 'default';
  const sqlPath = `${tablesDirRel}/${database}/${tableName}/${queryName}.sql`;
  const absPath = resolve(projectRoot, sqlPath);

  if (existsSync(absPath) && !flags.force) {
    p.log.error(`${sqlPath} already exists. Use --force or --name <other>.`);
    return 1;
  }

  let columns: GlueColumn[] | undefined;
  let requiredPartitions: RequiredPartition[] = [];
  let probeNotes: string[] = [];
  if (flags.fromSchema) {
    const spin = p.spinner();
    spin.start(`Fetching ${database}.${tableName} schema from Glue`);
    try {
      const schema = await fetchTableSchema(
        resolveRegion(config.region),
        database,
        tableName,
      );
      columns = schema.columns;
      spin.stop(`Fetched ${columns.length} column(s)`);
    } catch (err) {
      spin.stop('Could not fetch schema');
      p.log.warn(formatAwsError(err));
    }
  }

  // Always probe partition projection so required WHERE predicates land in
  // the scaffold even when --from-schema was not passed. The probe follows
  // Presto/Trino views to their underlying tables.
  try {
    const probe = await fetchRequiredPartitions(
      resolveRegion(config.region),
      database,
      tableName,
    );
    requiredPartitions = probe.partitions;
    probeNotes = probe.notes;
    for (const note of probeNotes) {
      p.log.info(note);
    }
  } catch {
    // Non-fatal: user may still want a plain scaffold.
  }

  const contents = buildQuerySql(tableName, columns, requiredPartitions, probeNotes);
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, contents, 'utf-8');
  p.log.success(`Wrote ${sqlPath}`);

  if (flags.noGenerate) {
    p.outro(`Next: run 'npx aathena generate' to produce the query function.`);
    return 0;
  }

  const spin = p.spinner();
  spin.start('Running generate');
  try {
    const result = await generate(config, projectRoot);
    spin.stop(
      `Generated ${result.typesGenerated} type(s), ${result.queriesGenerated} query file(s)`,
    );
  } catch (err) {
    spin.stop('Generate failed');
    p.log.error(formatAwsError(err));
    p.outro('Fix the errors above and re-run generate manually.');
    return 1;
  }

  p.outro('Done. Edit the SQL file, tweak {{params}}, and re-run generate as you iterate.');
  return 0;
}

export interface ParsedTarget {
  database: string;
  tableName: string;
}

/**
 * Parse `table` or `database.table`. Falls back to the config database
 * when only a table is supplied.
 */
export function parseTarget(
  input: string,
  fallbackDatabase: string,
): ParsedTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^[A-Za-z_][\w.]*$/.test(trimmed)) return null;

  const parts = trimmed.split('.');
  if (parts.length === 1) {
    return { database: fallbackDatabase, tableName: parts[0] };
  }
  if (parts.length === 2) {
    const [database, tableName] = parts;
    if (!database || !tableName) return null;
    return { database, tableName };
  }
  return null;
}

/**
 * Build a starter SQL file. When columns are provided, they're listed as a
 * comment block so the author can see the shape before writing their query.
 * Required partitions (Athena injected-projection columns) are injected as
 * {{placeholder}} predicates with matching `-- @param` annotations so the
 * query compiles and routes through sql-render's validation.
 */
export function buildQuerySql(
  tableName: string,
  columns?: GlueColumn[],
  requiredPartitions: RequiredPartition[] = [],
  probeNotes: string[] = [],
): string {
  const parts: string[] = [];
  parts.push(`-- Generated by 'aathena add'. Edit freely.`);
  parts.push(`-- See README for placeholder and parameter syntax.`);
  for (const note of probeNotes) {
    parts.push(`-- ${note}`);
  }
  if (columns && columns.length > 0) {
    parts.push(`--`);
    parts.push(`-- Columns:`);
    const nameWidth = Math.max(...columns.map((c) => c.name.length));
    for (const col of columns) {
      parts.push(`--   ${col.name.padEnd(nameWidth)}  ${col.type}`);
    }
  }
  for (const part of requiredPartitions) {
    parts.push(`-- @param ${part.name} string`);
  }
  parts.push(``);
  parts.push(`SELECT *`);
  parts.push(`FROM ${tableName}`);
  if (requiredPartitions.length > 0) {
    const predicates = requiredPartitions
      .map((part) => `${part.name} = '{{${part.name}}}'`)
      .join('\n  AND ');
    parts.push(`WHERE ${predicates}`);
  }
  // LIMIT as a {{placeholder}}: demonstrates the template syntax and lets
  // the caller tune the row count at invocation time.
  parts.push(`LIMIT {{limit}}`);
  parts.push(``);
  return parts.join('\n');
}

function formatAwsError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/**
 * Normalize a config-derived directory path for use in a POSIX-style relative
 * path. Strips a leading `./` and any trailing slashes so `{dir}/db/table/...`
 * concatenation produces a tidy path regardless of how the user spelled the
 * value in aathena.config.json.
 */
export function normalizeRelativeDir(dir: string): string {
  return dir.replace(/^\.\//, '').replace(/\/+$/, '');
}
