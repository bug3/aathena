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
    for (const table of selected) {
      const { path: sqlPath, contents, queryName } = buildSampleSql(database, table);
      const absPath = resolve(cwd, sqlPath);
      mkdirSync(dirname(absPath), { recursive: true });
      if (!existsSync(absPath)) {
        writeFileSync(absPath, contents, 'utf-8');
        scaffolded.push({ tableName: table, queryName });
        scaffoldedPaths.push(sqlPath);
      }
    }
    if (scaffoldedPaths.length > 0) {
      p.log.success(
        `Scaffolded ${scaffoldedPaths.length} starter SQL file(s): ${scaffoldedPaths.join(', ')}`,
      );
    }
  }

  // Auto-generate so the user lands with typed query functions ready to import
  const hasScaffolded = scaffolded.length > 0;
  if (!flags.noGenerate && hasScaffolded) {
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

  // Starter TS file showing how to invoke the generated queries
  let wroteMain = false;
  if (!flags.noExample && !flags.noGenerate && hasScaffolded) {
    const mainPath = resolve(cwd, 'src/main.ts');
    if (existsSync(mainPath)) {
      p.log.info('src/main.ts exists, not overwriting');
    } else {
      mkdirSync(dirname(mainPath), { recursive: true });
      writeFileSync(mainPath, buildMainExample(scaffolded), 'utf-8');
      p.log.success('Wrote src/main.ts');
      wroteMain = true;
    }
  }

  const nextSteps = wroteMain
    ? `Next: npx tsx src/main.ts`
    : hasScaffolded && !flags.noGenerate
      ? `Next: import from ./generated and call your queries.`
      : `Next: run 'npx aathena generate' to produce typed query functions.`;
  p.outro(nextSteps);
  return 0;
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

export function buildSampleSql(database: string, tableName?: string): SampleSqlFile {
  const table = tableName ?? 'example_table';
  const queryName = 'default';
  const path = `tables/${database}/${table}/${queryName}.sql`;
  const contents =
    `-- Starter aathena query. Edit or delete as needed.\n` +
    `-- See README for placeholder and parameter syntax.\n` +
    `\n` +
    `SELECT *\n` +
    `FROM ${table}\n` +
    `LIMIT 10\n`;
  return { path, contents, queryName };
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

  const lines: string[] = [
    `// Generated by 'aathena init'. Delete or adapt as needed.`,
    `import { ${runtimeImports} } from 'aathena';`,
    `import { ${importList} } from '../generated';`,
    ``,
    `async function main() {`,
    `  const athena = createClient();`,
    ``,
  ];

  if (!usesParallel) {
    const only = exports[0];
    lines.push(
      `  const ${only.tableName} = await ${only.exportName}(athena, {});`,
      `  console.log(\`${only.tableName}: \${${only.tableName}.rows.length} rows\`);`,
    );
  } else {
    const binds = exports.map((e) => e.tableName).join(', ');
    const calls = exports.map((e) => `      () => ${e.exportName}(athena, {}),`).join('\n');
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
