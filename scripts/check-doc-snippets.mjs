// Asserts that every code block in README.md marked with a snippet comment is
// byte-for-byte the corresponding file under docs/snippets/.
//
// Those files are typechecked by `typecheck:docs` against the real source and
// the example project's generated output, so binding the README to them is
// what stops a documented example from drifting away from what the generator
// emits. A README block claiming `row.eventId` when the generator writes
// `row.event_id` is the defect this check exists to make impossible.
//
// Usage in README.md:
//
//     <!-- snippet: run-a-query.ts -->
//     ```typescript
//     ...exact contents of docs/snippets/run-a-query.ts...
//     ```

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const README = join(REPO, 'README.md');
const SNIPPET_DIR = join(REPO, 'docs', 'snippets');
const MARKER = /^<!-- snippet: ([\w.-]+) -->$/;

const lines = readFileSync(README, 'utf8').split('\n');
const failures = [];
let checked = 0;

for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(MARKER);
  if (!match) continue;

  const name = match[1];
  const where = `README.md:${i + 1}`;

  if (!lines[i + 1]?.startsWith('```')) {
    failures.push(`${where}: marker for ${name} is not followed by a code fence`);
    continue;
  }

  let end = i + 2;
  while (end < lines.length && !lines[end].startsWith('```')) end++;
  if (end >= lines.length) {
    failures.push(`${where}: unterminated code fence after the ${name} marker`);
    continue;
  }

  const file = join(SNIPPET_DIR, name);
  if (!existsSync(file)) {
    failures.push(`${where}: no such snippet, docs/snippets/${name}`);
    continue;
  }

  checked++;
  const block = lines.slice(i + 2, end).join('\n');
  const source = readFileSync(file, 'utf8').replace(/\n+$/, '');
  if (block !== source) {
    failures.push(`${where}: block does not match docs/snippets/${name}`);
  }
}

// Guards the markers themselves: without this, deleting every marker would
// leave the check passing on an unbound README.
if (checked === 0) {
  failures.push('README.md contains no snippet markers');
}

for (const failure of failures) console.error(`  ${failure}`);
console.log(`checked ${checked} README snippet(s) against docs/snippets/`);
process.exit(failures.length > 0 ? 1 : 0);
