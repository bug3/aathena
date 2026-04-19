import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import * as p from '@clack/prompts';
import type { AathenaConfig } from '../../runtime/types';
import { generate } from '../../codegen/generate';
import { camelCase, pascalCase, isReservedWord } from '../../codegen/utils';
import {
  listDatabases,
  listTables,
  listWorkGroups,
  getWorkGroupDetails,
  resolveRegion,
  fetchRequiredPartitions,
  type RequiredPartition,
} from '../aws-discovery';

export interface InitFlags {
  force?: boolean;
  region?: string;
  database?: string;
  workgroup?: string;
  outputLocation?: string;
  /** Skip the table-scaffolding step entirely. */
  noSample?: boolean;
  /** Comma-separated list of tables to scaffold; bypasses the multi-select prompt. */
  tables?: string;
  /** Do not auto-run 'generate' after scaffolding. */
  noGenerate?: boolean;
  /** Skip writing src/main.ts. */
  noExample?: boolean;
}

interface ScaffoldedQuery {
  tableName: string;
  queryName: string;
  requiredPartitions: RequiredPartition[];
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

  // Table scaffolding
  const scaffolded: ScaffoldedQuery[] = [];
  const scaffoldedPaths: string[] = [];
  if (!flags.noSample) {
    const selected = await resolveTablesToScaffold(effectiveRegion, database, flags.tables);
    const partitionsByTable = await resolvePartitionsForSelected(
      effectiveRegion,
      database,
      selected,
    );
    for (const table of selected) {
      const info = partitionsByTable.get(table) ?? { partitions: [], notes: [] };
      const { path: sqlPath, contents, queryName } = buildSampleSql(
        database,
        table,
        info.partitions,
        info.notes,
      );
      const absPath = resolve(cwd, sqlPath);
      mkdirSync(dirname(absPath), { recursive: true });
      // Track every selected table so main.ts reflects the full selection
      // even on re-runs where the SQL already exists.
      scaffolded.push({ tableName: table, queryName, requiredPartitions: info.partitions });
      if (!existsSync(absPath)) {
        writeFileSync(absPath, contents, 'utf-8');
        scaffoldedPaths.push(sqlPath);
      }
    }
    if (scaffoldedPaths.length > 0) {
      p.log.success(
        `Scaffolded ${scaffoldedPaths.length} starter SQL file(s): ${scaffoldedPaths.join(', ')}`,
      );
    }
    const hasInjected = scaffolded.some((s) => s.requiredPartitions.length > 0);
    if (hasInjected) {
      p.log.info(
        `Injected-projection partitions detected: scaffolded SQL includes WHERE predicates and @param lines.`,
      );
    }
  }

  // Auto-generate so the user lands with typed query functions ready to import
  const hasSelection = scaffolded.length > 0;
  if (!flags.noGenerate && hasSelection) {
    const spin = p.spinner();
    spin.start('Running generate');
    try {
      const result = await generate(config, cwd);
      spin.stop(
        `Generated ${result.typesGenerated} type(s), ${result.queriesGenerated} query file(s)`,
      );
    } catch (err) {
      spin.stop('Generate failed');
      p.log.warn(formatAwsError(err));
      p.outro(`Fix the error above and re-run 'npx aathena generate'.`);
      return 1;
    }
  }

  // Starter TS file showing how to invoke the generated queries. Overwritten
  // under --force so re-running init with a new table selection refreshes
  // the example; SQL files are always preserved because the user may have
  // edited them.
  let wroteMain = false;
  if (!flags.noExample && !flags.noGenerate && hasSelection) {
    const mainPath = resolve(cwd, 'src/main.ts');
    const existed = existsSync(mainPath);
    if (existed && !flags.force) {
      p.log.info('src/main.ts exists, not overwriting (use --force to regenerate)');
    } else {
      mkdirSync(dirname(mainPath), { recursive: true });
      writeFileSync(mainPath, buildMainExample(scaffolded), 'utf-8');
      p.log.success(existed ? 'Rewrote src/main.ts' : 'Wrote src/main.ts');
      wroteMain = true;
    }
  }

  const nextSteps = wroteMain
    ? `Next: npx tsx src/main.ts`
    : hasSelection && !flags.noGenerate
      ? `Next: import from ./generated and call your queries.`
      : `Next: run 'npx aathena generate' to produce typed query functions.`;
  p.outro(nextSteps);
  return 0;
}

interface TablePartitionInfo {
  partitions: RequiredPartition[];
  notes: string[];
}

async function resolvePartitionsForSelected(
  region: string | undefined,
  database: string,
  tables: string[],
): Promise<Map<string, TablePartitionInfo>> {
  const out = new Map<string, TablePartitionInfo>();
  if (tables.length === 0) return out;

  const spin = p.spinner();
  spin.start('Inspecting table partitions');
  const settled = await Promise.allSettled(
    tables.map((t) => fetchRequiredPartitions(region, database, t)),
  );
  let withPartitions = 0;
  settled.forEach((res, i) => {
    const table = tables[i];
    if (res.status === 'fulfilled') {
      out.set(table, { partitions: res.value.partitions, notes: res.value.notes });
      if (res.value.partitions.length > 0) withPartitions++;
    } else {
      out.set(table, { partitions: [], notes: [] });
    }
  });
  spin.stop(
    withPartitions > 0
      ? `Partition probe done (${withPartitions} table(s) need WHERE predicates)`
      : 'Partition probe done',
  );

  // Surface any view-trace or probe notes
  for (const [table, info] of out) {
    for (const note of info.notes) {
      p.log.info(`${table}: ${note}`);
    }
  }
  return out;
}

async function resolveTablesToScaffold(
  region: string | undefined,
  database: string,
  tablesFlag: string | undefined,
): Promise<string[]> {
  // Explicit flag wins, no prompt
  if (tablesFlag !== undefined) {
    return tablesFlag
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const spin = p.spinner();
  spin.start(`Listing tables in ${database}`);
  let tables: Awaited<ReturnType<typeof listTables>> = [];
  try {
    tables = await listTables(region, database);
    spin.stop(`Found ${tables.length} table(s)`);
  } catch (err) {
    spin.stop('Could not list tables');
    p.log.warn(formatAwsError(err));
  }

  if (tables.length === 0) {
    // Keep the old behaviour: write a placeholder so the user sees how to shape
    // the next file.
    return ['example_table'];
  }

  const choice = await p.multiselect({
    message: 'Scaffold starter queries for which tables?',
    initialValues: [tables[0].name],
    required: false,
    options: tables.map((t) => ({ value: t.name, label: t.name })),
  });
  if (p.isCancel(choice)) return [];
  return choice as string[];
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
  queryName: string;
}

export function buildSampleSql(
  database: string,
  tableName?: string,
  requiredPartitions: RequiredPartition[] = [],
  probeNotes: string[] = [],
): SampleSqlFile {
  const table = tableName ?? 'example_table';
  const queryName = 'default';
  const path = `tables/${database}/${table}/${queryName}.sql`;

  const lines: string[] = [
    `-- Starter aathena query. Edit or delete as needed.`,
    `-- See README for placeholder and parameter syntax.`,
  ];

  // Any view-trace or probe notes as informational comments
  for (const note of probeNotes) {
    lines.push(`-- ${note}`);
  }

  // @param annotations for Athena-required partition predicates
  for (const part of requiredPartitions) {
    lines.push(`-- @param ${part.name} string`);
  }

  lines.push(``);
  lines.push(`SELECT *`);
  lines.push(`FROM ${table}`);

  if (requiredPartitions.length > 0) {
    const predicates = requiredPartitions
      .map((part) => `${part.name} = '{{${part.name}}}'`)
      .join('\n  AND ');
    lines.push(`WHERE ${predicates}`);
  }

  // Use {{limit}} so users encounter the placeholder syntax on their first
  // query. sql-render infers `limit: number` (positiveInt) from the context.
  lines.push(`LIMIT {{limit}}`);
  lines.push(``);

  return { path, contents: lines.join('\n'), queryName };
}

/**
 * Mirror of the barrel's export-name rule (see src/codegen/generate.ts).
 * Reserved-word query names get aliased to `{table}{Query}`; otherwise the
 * plain camelCase name is used. Returned name is the identifier the user
 * imports from `./generated`.
 */
export function barrelExportName(tableName: string, queryName: string): string {
  const camel = camelCase(queryName);
  if (isReservedWord(camel)) {
    return camelCase(tableName) + pascalCase(queryName);
  }
  return camel;
}

/**
 * Produce a runnable TypeScript file that imports every scaffolded query and
 * shows the user how to call them. Single scaffold -> one call; 2+ -> a
 * parallel() demo so the user sees both invocation styles.
 *
 * When a scaffolded table has injected-projection partitions, the call site
 * passes REPLACE_ME placeholder values. A note at the top of the file tells
 * the user where to edit before running.
 */
export function buildMainExample(entries: ScaffoldedQuery[]): string {
  if (entries.length === 0) return buildEmptyExample();

  const exports = entries.map((e) => ({
    ...e,
    exportName: barrelExportName(e.tableName, e.queryName),
  }));

  const importList = exports.map((e) => e.exportName).join(', ');
  const usesParallel = entries.length >= 2;
  const runtimeImports = usesParallel ? 'createClient, parallel' : 'createClient';
  const hasPlaceholders = exports.some((e) => e.requiredPartitions.length > 0);

  const lines: string[] = [
    `// Generated by 'aathena init'. Delete or adapt as needed.`,
  ];
  if (hasPlaceholders) {
    lines.push(
      `// NOTE: Some scaffolded tables have injected-projection partitions that`,
      `// require static WHERE predicates. Replace 'REPLACE_ME' with real values`,
      `// below before running.`,
    );
  }
  lines.push(
    `import { ${runtimeImports} } from 'aathena';`,
    `import { ${importList} } from '../generated';`,
    ``,
    `async function main() {`,
    `  const athena = createClient();`,
    ``,
  );

  if (!usesParallel) {
    const only = exports[0];
    const paramsLiteral = renderParamsLiteral(only.requiredPartitions);
    lines.push(
      `  const ${only.tableName} = await ${only.exportName}(athena, ${paramsLiteral});`,
      `  console.log(\`${only.tableName}: \${${only.tableName}.rows.length} rows\`);`,
    );
  } else {
    const binds = exports.map((e) => e.tableName).join(', ');
    const calls = exports
      .map(
        (e) =>
          `      () => ${e.exportName}(athena, ${renderParamsLiteral(e.requiredPartitions)}),`,
      )
      .join('\n');
    const log = exports.map((e) => `${e.tableName}: \${${e.tableName}.rows.length} rows`).join(', ');
    lines.push(
      `  // Run all scaffolded queries in parallel. 'concurrency: auto' respects`,
      `  // Athena's per-account service quota on active DML queries.`,
      `  const [${binds}] = await parallel(`,
      `    [`,
      calls,
      `    ],`,
      `    { concurrency: 'auto', client: athena },`,
      `  );`,
      `  console.log(\`${log}\`);`,
    );
  }

  lines.push(
    `}`,
    ``,
    `main().catch((err) => {`,
    `  console.error(err);`,
    `  process.exit(1);`,
    `});`,
    ``,
  );
  return lines.join('\n');
}

function renderParamsLiteral(partitions: RequiredPartition[]): string {
  const pairs: string[] = [];
  for (const part of partitions) {
    pairs.push(`${part.name}: 'REPLACE_ME'`);
  }
  // Scaffolded SQL uses LIMIT {{limit}}; passing a default here matches the
  // generated params type and keeps main.ts runnable out of the box.
  pairs.push('limit: 33');
  return `{ ${pairs.join(', ')} }`;
}

function buildEmptyExample(): string {
  return (
    `// Generated by 'aathena init'. Delete or adapt as needed.\n` +
    `import { createClient } from 'aathena';\n` +
    `\n` +
    `async function main() {\n` +
    `  const athena = createClient();\n` +
    `  const result = await athena.query('SELECT 1 AS ping');\n` +
    `  console.log(result.rows);\n` +
    `}\n` +
    `\n` +
    `main().catch((err) => {\n` +
    `  console.error(err);\n` +
    `  process.exit(1);\n` +
    `});\n`
  );
}

function formatAwsError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`;
  }
  return String(err);
}
