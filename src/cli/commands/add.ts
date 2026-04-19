import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import * as p from '@clack/prompts';
import type { AathenaConfig } from '../../runtime/types';
import { fetchTableSchema, type GlueColumn } from '../../codegen/glue-fetcher';
import { generate } from '../../codegen/generate';
import { resolveRegion } from '../aws-discovery';

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
  const configPath = resolve(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    p.log.error(
      `No ${CONFIG_FILE} found at ${cwd}. Run 'aathena init' first.`,
    );
    return 1;
  }
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
          hint: `tables/${database}/${tableName}/, runtime uses ${database}`,
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
  const sqlPath = `tables/${database}/${tableName}/${queryName}.sql`;
  const absPath = resolve(cwd, sqlPath);

  if (existsSync(absPath) && !flags.force) {
    p.log.error(`${sqlPath} already exists. Use --force or --name <other>.`);
    return 1;
  }

  let columns: GlueColumn[] | undefined;
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

  const contents = buildQuerySql(tableName, columns);
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
    const result = await generate(config, cwd);
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
 */
export function buildQuerySql(tableName: string, columns?: GlueColumn[]): string {
  const parts: string[] = [];
  parts.push(`-- Generated by 'aathena add'. Edit freely.`);
  parts.push(`-- Placeholders use {{name}}; annotate types with '-- @param name type'.`);
  if (columns && columns.length > 0) {
    parts.push(`--`);
    parts.push(`-- Columns:`);
    const nameWidth = Math.max(...columns.map((c) => c.name.length));
    for (const col of columns) {
      parts.push(`--   ${col.name.padEnd(nameWidth)}  ${col.type}`);
    }
  }
  parts.push(``);
  parts.push(`SELECT *`);
  parts.push(`FROM ${tableName}`);
  parts.push(`LIMIT 10`);
  parts.push(``);
  return parts.join('\n');
}

function formatAwsError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}
