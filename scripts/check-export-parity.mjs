// Asserts that the value exports a `.d.ts` declares are the ones the emitted
// JavaScript actually has, for both entry points.
//
// The bundler can rename an internal binding and re-export it under that
// generated name. That produced a `dist/index.d.ts` declaring `findProjectRoot
// as f` while `dist/index.js` exported no `f` at all: `import { f } from
// 'aathena'` typechecked and then failed at runtime, and the runtime entry
// resolved its own `findProjectRoot` through a symbol that existed only in the
// declaration graph. Both files were individually plausible; only comparing
// them showed the lie.
//
// Type-ness is resolved through the TypeScript compiler rather than by reading
// `type` markers in the text. A re-export can omit the marker and still be
// type-only - `dist/runtime/index.d.ts` does exactly that - so a textual check
// reports those as missing runtime exports, which they are not.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRIES = [
  { types: 'dist/index.d.ts', js: 'dist/index.js' },
  { types: 'dist/runtime/index.d.ts', js: 'dist/runtime/index.js' },
];

/** Exported names that carry a runtime value, per the type checker. */
function declaredValueExports(dtsPath) {
  const program = ts.createProgram([dtsPath], {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(dtsPath);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return null;

  const values = new Set();
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const resolved =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (resolved.flags & ts.SymbolFlags.Value) values.add(exported.name);
  }
  return values;
}

/** Names an emitted `export { ... }` clause exposes, as an importer writes them. */
function emittedExports(jsSource) {
  const names = new Set();
  for (const clause of jsSource.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const raw of clause[1].split(',')) {
      const entry = raw.trim();
      if (!entry) continue;
      names.add(entry.split(/\s+as\s+/).pop().trim());
    }
  }
  return names;
}

const failures = [];
let compared = 0;

for (const entry of ENTRIES) {
  const typesPath = join(REPO, entry.types);
  const jsPath = join(REPO, entry.js);

  if (!existsSync(typesPath) || !existsSync(jsPath)) {
    failures.push(`${entry.types}: build output missing. Run \`npm run build\` first.`);
    continue;
  }

  const declared = declaredValueExports(typesPath);
  if (declared === null) {
    failures.push(`${entry.types}: could not be resolved as a module`);
    continue;
  }
  const emitted = emittedExports(readFileSync(jsPath, 'utf8'));
  compared += declared.size;

  for (const name of declared) {
    if (!emitted.has(name)) {
      failures.push(`${entry.types} declares value export '${name}', ${entry.js} does not export it`);
    }
  }
  for (const name of emitted) {
    if (!declared.has(name)) {
      failures.push(`${entry.js} exports '${name}', ${entry.types} does not declare it as a value`);
    }
  }
}

// Guards the check itself against a renamed or empty build output.
if (compared === 0) {
  failures.push('no value exports found in the published entry points');
}

for (const failure of failures) console.error(`  ${failure}`);
console.log(`compared ${compared} value export(s) across ${ENTRIES.length} entry points`);
process.exit(failures.length > 0 ? 1 : 0);
