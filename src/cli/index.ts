import { generate } from '../codegen/generate';
import { findProjectRoot, loadConfig } from '../runtime/config';
import { parseArgs, flagString, flagBool } from './args';
import { runInit } from './commands/init';
import { runAdd } from './commands/add';

const HELP = `
aathena - Type-safe AWS Athena client with codegen

Usage:
  aathena init [flags]                Interactive scaffold for a new project
  aathena add <table> [flags]         Scaffold a new query (use 'db.table' for cross-database)
  aathena generate                    Fetch table schemas and generate typed query functions
  aathena help                        Show this help message

Init flags:
  --force                  Overwrite an existing aathena.config.json
  --region <name>          Skip the region prompt
  --database <name>        Skip the database prompt
  --workgroup <name>       Skip the workgroup prompt
  --output-location <s3>   Skip the output-location prompt
  --no-sample              Do not write a sample SQL file

Add flags:
  --name <query-name>      Query filename (default: 'default')
  --from-schema            Fetch Glue columns and include them as a comment block
  --no-generate            Do not auto-run generate after scaffolding
  --force                  Overwrite an existing SQL file

Configuration:
  aathena looks for aathena.config.json in the project root:

  {
    "database": "sampledb",
    "workgroup": "primary",
    "outputLocation": "s3://my-bucket/athena-results/",
    "tablesDir": "./tables",
    "outDir": "./generated"
  }
`;

async function main() {
  const argv = process.argv.slice(2);
  const { positional, flags } = parseArgs(argv);
  const command = positional[0];

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    process.exit(0);
  }

  if (command === 'init') {
    const cwd = process.cwd();
    const code = await runInit(cwd, {
      force: flagBool(flags, 'force'),
      region: flagString(flags, 'region'),
      database: flagString(flags, 'database'),
      workgroup: flagString(flags, 'workgroup'),
      outputLocation: flagString(flags, 'output-location'),
      noSample: flagBool(flags, 'sample') === false,
    });
    process.exit(code);
  }

  if (command === 'add') {
    const cwd = process.cwd();
    const code = await runAdd(cwd, positional[1], {
      name: flagString(flags, 'name'),
      fromSchema: flagBool(flags, 'from-schema'),
      noGenerate: flagBool(flags, 'generate') === false,
      force: flagBool(flags, 'force'),
    });
    process.exit(code);
  }

  if (command === 'generate') {
    const cwd = findProjectRoot();
    const config = loadConfig(cwd);

    console.log('aathena generate');
    console.log(`  database: ${config.database}`);
    console.log(`  tables:   ${config.tablesDir ?? 'tables'}`);
    console.log(`  output:   ${config.outDir ?? 'generated'}`);
    console.log('');

    const result = await generate(config, cwd);

    console.log('');
    console.log(`Done! Generated ${result.typesGenerated} type(s) and ${result.queriesGenerated} query file(s).`);
    process.exit(0);
  }

  console.error(`Unknown command: ${command}`);
  console.log(HELP);
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
