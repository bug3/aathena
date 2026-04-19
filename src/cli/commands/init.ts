import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import * as p from '@clack/prompts';
import type { AathenaConfig } from '../../runtime/types';
import {
  listDatabases,
  listTables,
  listWorkGroups,
  getWorkGroupDetails,
  resolveRegion,
} from '../aws-discovery';

export interface InitFlags {
  force?: boolean;
  region?: string;
  database?: string;
  workgroup?: string;
  outputLocation?: string;
  noSample?: boolean;
}

const CONFIG_FILE = 'aathena.config.json';

export async function runInit(cwd: string, flags: InitFlags): Promise<number> {
  const configPath = resolve(cwd, CONFIG_FILE);

  if (existsSync(configPath) && !flags.force) {
    p.log.error(
      `${CONFIG_FILE} already exists at ${cwd}. Use --force to overwrite.`,
    );
    return 1;
  }

  p.intro('aathena init');

  const region = resolveRegion(flags.region);
  let effectiveRegion = region;
  if (!effectiveRegion) {
    const answer = await p.text({
      message: 'AWS region?',
      placeholder: 'us-east-1',
      validate: (v) => (v ? undefined : 'Region is required'),
    });
    if (p.isCancel(answer)) {
      p.cancel('Cancelled.');
      return 1;
    }
    effectiveRegion = answer;
  }

  // Database
  let database: string;
  if (flags.database) {
    database = flags.database;
  } else {
    const spin = p.spinner();
    spin.start('Listing Glue databases');
    let dbs: Awaited<ReturnType<typeof listDatabases>> = [];
    try {
      dbs = await listDatabases(effectiveRegion);
      spin.stop(`Found ${dbs.length} database(s)`);
    } catch (err) {
      spin.stop('Could not list Glue databases');
      p.log.warn(formatAwsError(err));
    }

    if (dbs.length > 0) {
      const choice = await p.select({
        message: 'Select primary database',
        options: dbs.map((d) => ({
          value: d.name,
          label: d.name,
          hint: d.description,
        })),
      });
      if (p.isCancel(choice)) {
        p.cancel('Cancelled.');
        return 1;
      }
      database = choice;
    } else {
      const typed = await p.text({
        message: 'Database name',
        placeholder: 'sampledb',
        validate: (v) => (v ? undefined : 'Database is required'),
      });
      if (p.isCancel(typed)) {
        p.cancel('Cancelled.');
        return 1;
      }
      database = typed;
    }
  }

  // Workgroup
  let workgroup: string;
  if (flags.workgroup) {
    workgroup = flags.workgroup;
  } else {
    const spin = p.spinner();
    spin.start('Listing Athena workgroups');
    let wgs: Awaited<ReturnType<typeof listWorkGroups>> = [];
    try {
      wgs = await listWorkGroups(effectiveRegion);
      spin.stop(`Found ${wgs.length} workgroup(s)`);
    } catch (err) {
      spin.stop('Could not list workgroups');
      p.log.warn(formatAwsError(err));
    }

    if (wgs.length > 0) {
      const choice = await p.select({
        message: 'Select workgroup',
        initialValue: wgs.find((w) => w.name === 'primary')?.name ?? wgs[0].name,
        options: wgs.map((w) => ({
          value: w.name,
          label: w.name,
          hint: w.state,
        })),
      });
      if (p.isCancel(choice)) {
        p.cancel('Cancelled.');
        return 1;
      }
      workgroup = choice;
    } else {
      workgroup = 'primary';
    }
  }

  // Output location
  let outputLocation: string | undefined = flags.outputLocation;
  if (!outputLocation) {
    try {
      const wg = await getWorkGroupDetails(effectiveRegion, workgroup);
      if (wg.outputLocation) {
        outputLocation = wg.outputLocation;
        p.log.info(`outputLocation inherited from workgroup: ${wg.outputLocation}`);
      }
    } catch {
      // ignore - ask below
    }
    if (!outputLocation) {
      const typed = await p.text({
        message: 'S3 output location (leave empty if workgroup has a default)',
        placeholder: 's3://my-bucket/athena-results/',
      });
      if (p.isCancel(typed)) {
        p.cancel('Cancelled.');
        return 1;
      }
      outputLocation = typed || undefined;
    }
  }

  // Build and write config
  const config = buildConfig({
    region: effectiveRegion,
    database,
    workgroup,
    outputLocation,
  });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  p.log.success(`Wrote ${CONFIG_FILE}`);

  // .gitignore
  const gitignorePath = resolve(cwd, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : '';
  const merged = mergeGitignore(existing);
  if (merged !== existing) {
    writeFileSync(gitignorePath, merged, 'utf-8');
    p.log.success('Updated .gitignore');
  }

  // Sample SQL
  if (!flags.noSample) {
    let sampleTable: string | undefined;
    try {
      const tables = await listTables(effectiveRegion, database);
      sampleTable = tables[0]?.name;
    } catch {
      // fine, use placeholder
    }
    const { path: sqlPath, contents } = buildSampleSql(database, sampleTable);
    const absPath = resolve(cwd, sqlPath);
    mkdirSync(dirname(absPath), { recursive: true });
    if (!existsSync(absPath)) {
      writeFileSync(absPath, contents, 'utf-8');
      p.log.success(`Wrote ${sqlPath}`);
    }
  }

  p.outro(
    `Next: run 'npx aathena generate' to produce typed query functions.`,
  );
  return 0;
}

export interface BuildConfigInput {
  region?: string;
  database: string;
  workgroup?: string;
  outputLocation?: string;
}

export function buildConfig(input: BuildConfigInput): AathenaConfig {
  const out: AathenaConfig = { database: input.database };
  if (input.region) out.region = input.region;
  if (input.workgroup) out.workgroup = input.workgroup;
  if (input.outputLocation) out.outputLocation = input.outputLocation;
  return out;
}

export function mergeGitignore(existing: string): string {
  const entries = new Set(existing.split('\n').map((l) => l.trim()).filter(Boolean));
  const toAdd = ['generated/', 'node_modules/'].filter((e) => !entries.has(e));
  if (toAdd.length === 0) return existing;

  const base = existing.trimEnd();
  const prefix = base ? base + '\n\n' : '';
  return prefix + '# aathena\n' + toAdd.join('\n') + '\n';
}

export interface SampleSqlFile {
  path: string;
  contents: string;
}

export function buildSampleSql(database: string, tableName?: string): SampleSqlFile {
  const table = tableName ?? 'example_table';
  const path = `tables/${database}/${table}/example.sql`;
  const contents =
    `-- Sample aathena query. Edit or delete as needed.\n` +
    `-- Placeholders use {{name}} syntax; annotate types with '-- @param name type' on their own line.\n` +
    `\n` +
    `SELECT *\n` +
    `FROM ${table}\n` +
    `LIMIT 10\n`;
  return { path, contents };
}

function formatAwsError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}
