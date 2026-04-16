import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative, dirname, join, basename, extname } from 'node:path';
import type { AathenaConfig } from '../runtime/types';
import { parseSQL } from './sql-parser';
import { fetchTableSchema, type TableSchema } from './glue-fetcher';
import { generateTypeFile } from './type-generator';
import { generateQueryFile } from './query-generator';
import { pascalCase, camelCase } from './utils';

interface GenerateResult {
  typesGenerated: number;
  queriesGenerated: number;
}

/**
 * Main codegen orchestrator.
 *
 * 1. Scans tables/ for SQL files → extracts database/table structure
 * 2. Fetches table schemas from Glue
 * 3. Generates types/ from Glue metadata
 * 4. Generates queries/ from SQL files + inferred param types
 */
export async function generate(config: AathenaConfig, cwd: string): Promise<GenerateResult> {
  const tablesDir = resolve(cwd, config.tablesDir ?? 'tables');
  const outDir = resolve(cwd, config.outDir ?? 'generated');

  // 1. Discover SQL files and extract structure
  const tablesDirRel = config.tablesDir ?? 'tables';
  const sqlFiles = discoverSQLFiles(tablesDir, tablesDirRel);

  if (sqlFiles.length === 0) {
    console.log('No SQL files found in', tablesDir);
    return { typesGenerated: 0, queriesGenerated: 0 };
  }

  // 2. Identify unique database.table pairs
  const tableSet = new Map<string, { database: string; tableName: string }>();
  for (const file of sqlFiles) {
    const key = `${file.database}.${file.tableName}`;
    if (!tableSet.has(key)) {
      tableSet.set(key, { database: file.database, tableName: file.tableName });
    }
  }

  // 3. Fetch table schemas from Glue (parallel)
  console.log(`Fetching schemas for ${tableSet.size} table(s)...`);
  const schemas = new Map<string, TableSchema>();
  const failedTables: string[] = [];

  const entries = [...tableSet.entries()];
  const results = await Promise.allSettled(
    entries.map(([, { database, tableName }]) =>
      fetchTableSchema(config.region, database, tableName),
    ),
  );

  for (let i = 0; i < results.length; i++) {
    const key = entries[i][0];
    const result = results[i];
    if (result.status === 'fulfilled') {
      schemas.set(key, result.value);
      console.log(`  ✓ ${key} (${result.value.columns.length} columns)`);
    } else {
      failedTables.push(key);
      console.error(`  ✗ ${key}: ${result.reason?.message ?? result.reason}`);
    }
  }

  if (failedTables.length > 0) {
    throw new Error(
      `Failed to fetch schemas for: ${failedTables.join(', ')}. ` +
      `Fix the errors above or remove the corresponding SQL files.`,
    );
  }

  // 4. Generate type files
  const typesDir = resolve(outDir, 'types');
  let typesGenerated = 0;

  for (const [, schema] of schemas) {
    const typeDir = resolve(typesDir, schema.database);
    mkdirSync(typeDir, { recursive: true });

    const content = generateTypeFile(schema);
    const filePath = resolve(typeDir, `${schema.tableName}.ts`);
    writeFileSync(filePath, content, 'utf-8');
    typesGenerated++;
  }

  // 5. Generate query files
  const queriesDir = resolve(outDir, 'queries');
  let queriesGenerated = 0;

  for (const file of sqlFiles) {
    const sql = readFileSync(file.absolutePath, 'utf-8');
    const parsed = parseSQL(sql);

    const queryFileDir = resolve(queriesDir, file.relativeDirFromTables);
    mkdirSync(queryFileDir, { recursive: true });

    const queryFilePath = resolve(queryFileDir, `${file.queryName}.ts`);
    const typesImportPath = computeRelativeImport(
      queryFilePath,
      resolve(typesDir, file.database, `${file.tableName}.ts`),
    );

    const content = generateQueryFile({
      sqlRelativePath: file.relativePathFromRoot,
      tableName: file.tableName,
      database: file.database,
      parsed,
      typesImportPath,
    });

    writeFileSync(queryFilePath, content, 'utf-8');
    queriesGenerated++;
  }

  // 6. Generate barrel index
  generateBarrelIndex(outDir, sqlFiles, schemas);

  return { typesGenerated, queriesGenerated };
}

interface SQLFileInfo {
  absolutePath: string;
  relativePathFromRoot: string;   // e.g. "tables/sampledb/events/product.sql"
  relativeDirFromTables: string;  // e.g. "sampledb/events"
  database: string;               // e.g. "sampledb"
  tableName: string;              // e.g. "events"
  queryName: string;              // e.g. "product"
}

function discoverSQLFiles(tablesDir: string, tablesDirRel: string): SQLFileInfo[] {
  const files: SQLFileInfo[] = [];
  // Normalize: strip leading ./ for clean path joining
  const prefix = tablesDirRel.replace(/^\.\//, '');

  function walk(dir: string, relPath: string) {
    // Sort for deterministic traversal across filesystems (readdirSync is unordered).
    for (const entry of readdirSync(dir).sort()) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath, relPath ? `${relPath}/${entry}` : entry);
      } else if (extname(entry) === '.sql') {
        const rel = relPath ? `${relPath}/${entry}` : entry;
        const parts = rel.split('/');

        // Structure: database/table/.../queryName.sql
        // Minimum: database/table/query.sql (3 parts)
        if (parts.length < 3) {
          console.warn(`  Skipping ${rel}: expected {database}/{table}/query.sql`);
          continue;
        }

        const database = parts[0];
        const tableName = parts[1];
        const queryName = basename(entry, '.sql');

        files.push({
          absolutePath: fullPath,
          relativePathFromRoot: `${prefix}/${rel}`,
          relativeDirFromTables: dirname(rel),
          database,
          tableName,
          queryName,
        });
      }
    }
  }

  walk(tablesDir, '');
  return files;
}

function computeRelativeImport(from: string, to: string): string {
  let rel = relative(dirname(from), to).replace(/\.ts$/, '');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function generateBarrelIndex(
  outDir: string,
  sqlFiles: SQLFileInfo[],
  schemas: Map<string, TableSchema>,
): void {
  const lines: string[] = [
    '// Auto-generated by aathena\n',
    '// Types',
  ];

  for (const [, schema] of schemas) {
    lines.push(
      `export type { ${pascalCase(schema.tableName)} } from './types/${schema.database}/${schema.tableName}';`,
    );
  }

  lines.push('', '// Queries');

  // Detect duplicate query names across tables
  const nameCount = new Map<string, number>();
  for (const file of sqlFiles) {
    const name = camelCase(file.queryName);
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }

  for (const file of sqlFiles) {
    const queryFnName = camelCase(file.queryName);
    const importPath = `./queries/${file.relativeDirFromTables}/${file.queryName}`;

    if ((nameCount.get(queryFnName) ?? 0) > 1) {
      // Prefix with table name to avoid duplicate exports
      const aliasName = camelCase(file.tableName) + pascalCase(file.queryName);
      lines.push(
        `export { ${queryFnName} as ${aliasName} } from '${importPath}';`,
      );
    } else {
      lines.push(
        `export { ${queryFnName} } from '${importPath}';`,
      );
    }
  }

  lines.push('');
  writeFileSync(resolve(outDir, 'index.ts'), lines.join('\n'), 'utf-8');
}

