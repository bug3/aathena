import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { buildBarrelContent } from '../src/codegen/generate';
import type { TableSchema } from '../src/codegen/glue-fetcher';
import { generateQueryFile } from '../src/codegen/query-generator';
import { parseSQL } from '../src/codegen/sql-parser';
import { generateTypeFile } from '../src/codegen/type-generator';

// The example projects are the advertised learning path: CI typechecks them,
// the documentation site includes their generated files verbatim, and the
// README's flagship type example is one of them. Typechecking only proves they
// still compile - it says nothing about whether they still match what codegen
// emits today. Change `generateTypeFile` and every committed file silently
// becomes a historical artifact that the site keeps publishing.
//
// So regenerate all of it from the recorded schemas and diff. The path layout
// is derived here rather than imported, deliberately: a test that shares every
// line with the implementation moves in lockstep with it and cannot notice a
// change. If codegen moves a file, this fails and a human decides.
const ROOT = resolve(__dirname, '..');
const SCHEMAS = JSON.parse(
  readFileSync(join(ROOT, 'tests/fixtures/example-schemas.json'), 'utf-8'),
) as Record<string, Record<string, TableSchema>>;

const PROJECTS = ['examples/basic', 'examples/custom-paths'];

interface SQLFile {
  relativePathFromRoot: string;
  relativeDirFromTables: string;
  database: string;
  tableName: string;
  queryName: string;
}

function discover(tablesDir: string, tablesDirRel: string): SQLFile[] {
  const prefix = tablesDirRel.replace(/^\.\//, '');
  const files: SQLFile[] = [];

  function walk(dir: string, relPath: string): void {
    for (const entry of readdirSync(dir).sort()) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full, relPath ? `${relPath}/${entry}` : entry);
      } else if (entry.endsWith('.sql')) {
        const rel = relPath ? `${relPath}/${entry}` : entry;
        const parts = rel.split('/');
        files.push({
          relativePathFromRoot: `${prefix}/${rel}`,
          relativeDirFromTables: parts.slice(0, -1).join('/'),
          database: parts[0],
          tableName: parts[1],
          queryName: entry.replace(/\.sql$/, ''),
        });
      }
    }
  }

  walk(tablesDir, '');
  return files;
}

function importPath(from: string, to: string): string {
  const rel = relative(dirname(from), to).replace(/\.ts$/, '');
  return rel.startsWith('.') ? rel : `./${rel}`;
}

describe.each(PROJECTS)('%s generated output', (project) => {
  const projectDir = join(ROOT, project);
  const config = JSON.parse(
    readFileSync(join(projectDir, 'aathena.config.json'), 'utf-8'),
  ) as { database: string; tablesDir?: string; outDir?: string };

  const tablesDirRel = config.tablesDir ?? './tables';
  const outDirRel = config.outDir ?? './generated';
  const outDir = resolve(projectDir, outDirRel);
  const schemas = new Map(Object.entries(SCHEMAS[project]));
  const sqlFiles = discover(resolve(projectDir, tablesDirRel), tablesDirRel);

  const committed = (path: string): string => readFileSync(path, 'utf-8');

  // `npm run examples:regen` sets this to rewrite the fixtures instead of
  // asserting, which is what the failure message asks for. Same code path
  // either way, so what the test checks is what regeneration writes.
  const REGEN = process.env.UPDATE_EXAMPLES === '1';
  const hint = `stale: run \`npm run examples:regen\` and commit the result (${project})`;

  const match = (path: string, generated: string): void => {
    if (REGEN) {
      writeFileSync(path, generated, 'utf-8');
      return;
    }
    expect(generated, hint).toBe(committed(path));
  };

  it('has a recorded schema for every generated type file', () => {
    const onDisk = [...schemas.values()]
      .map((s) => join(outDir, 'types', s.database, `${s.tableName}.ts`))
      .sort();
    const expected = readdirSync(join(outDir, 'types'), { recursive: true })
      .filter((p) => String(p).endsWith('.ts'))
      .map((p) => join(outDir, 'types', String(p)))
      .sort();
    expect(onDisk).toEqual(expected);
  });

  // fetchTableSchema builds `[...regularColumns, ...partitionKeys]` and marks
  // only partition keys NOT NULL, so a real catalog always yields a nullable
  // prefix followed by a NOT NULL suffix. A fixture that marks a regular column
  // NOT NULL publishes a row type Glue cannot produce - and context7.json rule 2
  // tells agents that a NOT NULL column is a partition key they may rely on.
  it.each([...schemas.values()].map((s) => [`${s.database}.${s.tableName}`, s] as const))(
    'records %s with NOT NULL columns only in trailing position',
    (_name, schema) => {
      const lastNullable = schema.columns.reduce((last, c, i) => (c.nullable ? i : last), -1);
      const misplaced = schema.columns
        .slice(0, Math.max(lastNullable, 0))
        .filter((c) => !c.nullable)
        .map((c) => c.name);
      expect(misplaced, 'NOT NULL is the partition-key shape; it cannot precede a nullable column').toEqual([]);
    },
  );

  it.each([...schemas.values()].map((s) => [`${s.database}.${s.tableName}`, s] as const))(
    'regenerates the type file for %s',
    (_name, schema) => {
      const path = join(outDir, 'types', schema.database, `${schema.tableName}.ts`);
      match(path, generateTypeFile(schema));
    },
  );

  it.each(sqlFiles.map((f) => [f.relativePathFromRoot, f] as const))(
    'regenerates the query file for %s',
    (_name, file) => {
      const path = join(outDir, 'queries', file.relativeDirFromTables, `${file.queryName}.ts`);
      const generated = generateQueryFile({
        sqlRelativePath: file.relativePathFromRoot,
        tableName: file.tableName,
        database: file.database,
        primaryDatabase: config.database,
        parsed: parseSQL(committed(join(projectDir, file.relativePathFromRoot))),
        typesImportPath: importPath(
          path,
          join(outDir, 'types', file.database, `${file.tableName}.ts`),
        ),
      });
      match(path, generated);
    },
  );

  it('regenerates the barrel', () => {
    match(join(outDir, 'index.ts'), buildBarrelContent(sqlFiles, schemas));
  });
});
