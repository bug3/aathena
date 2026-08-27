// Asserts that every code block marked with a snippet comment is byte-for-byte
// the corresponding file under docs/snippets/.
//
// Those files are typechecked by `typecheck:docs` against the real source and
// the example project's generated output, so binding a document to them is
// what stops a documented example from drifting away from what the generator
// emits. A README block claiming `row.eventId` when the generator writes
// `row.event_id` is the defect this check exists to make impossible.
//
// The agent skill is bound the same way and for the same reason: it is
// published to consumers who never see this repository, so a stale example in
// it is worse than one in the README.
//
// Usage:
//
//     <!-- snippet: run-a-query.ts -->
//     ```typescript
//     ...exact contents of docs/snippets/run-a-query.ts...
//     ```

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SNIPPET_DIR = join(REPO, 'docs', 'snippets');
const MARKER = /^<!-- snippet: ([\w.-]+) -->$/;

// Every document that is allowed to quote a snippet. Each must carry at least
// one marker: a document listed here with none has either lost its bindings or
// no longer belongs on the list, and both are worth a failure.
const TARGETS = ['README.md', 'skills/aathena/SKILL.md'];

const failures = [];
let total = 0;

for (const target of TARGETS) {
  const lines = readFileSync(join(REPO, target), 'utf8').split('\n');
  let checked = 0;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(MARKER);
    if (!match) continue;

    const name = match[1];
    const where = `${target}:${i + 1}`;

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
  // leave the check passing on an unbound document.
  if (checked === 0) failures.push(`${target} contains no snippet markers`);
  total += checked;
}

for (const failure of failures) console.error(`  ${failure}`);
console.log(`checked ${total} snippet(s) across ${TARGETS.length} document(s) against docs/snippets/`);
process.exit(failures.length > 0 ? 1 : 0);
