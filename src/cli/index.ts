import { generate } from '../codegen/generate';
import { findProjectRoot, loadConfig } from '../runtime/config';

const HELP = `
aathena - Type-safe AWS Athena client with codegen

Usage:
  aathena generate    Fetch table schemas and generate typed query functions
  aathena help        Show this help message

Configuration:
  Create aathena.config.json in your project root:

  {
    "database": "sampledb",
    "workgroup": "primary",
    "outputLocation": "s3://my-bucket/athena-results/",
    "tablesDir": "./tables",
    "outDir": "./generated"
  }
`;

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help' || command === '--help') {
    console.log(HELP);
    process.exit(0);
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
