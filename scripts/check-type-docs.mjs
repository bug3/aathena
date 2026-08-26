// Asserts that every declaration in the published type surface carries a doc
// block.
//
// `dist/*.d.ts` is what an agent finds in `node_modules` and what an editor
// shows on hover. It is frequently the only thing read - the README may never
// be opened, the types always are. An undocumented export there is a symbol a
// reader has to guess at.
//
// This runs against the build output rather than the source on purpose: `//`
// comments do not survive into a `.d.ts`, so a source file can look well
// commented while consumers receive nothing. Checking the artifact is the only
// way to catch that.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SURFACES = ['dist/index.d.ts', 'dist/runtime/index.d.ts'];
const DECLARATION = /^\s*(?:export\s+)?(?:declare\s+)?(?:function|class|interface|type|const)\s+(\w+)/;

const failures = [];
let checked = 0;

for (const surface of SURFACES) {
  const path = join(REPO, surface);
  if (!existsSync(path)) {
    failures.push(`${surface}: missing. Run \`npm run build\` first.`);
    continue;
  }

  const lines = readFileSync(path, 'utf8').split('\n');
  const documented = new Set();
  const seen = [];

  lines.forEach((line, i) => {
    const match = line.match(DECLARATION);
    if (!match) return;
    seen.push(match[1]);
    // A doc block ends on one of the two lines above the declaration:
    // directly above, or above an intervening `export` modifier line.
    for (let j = Math.max(0, i - 2); j < i; j++) {
      if (lines[j].trim().endsWith('*/')) documented.add(match[1]);
    }
  });

  const unique = [...new Set(seen)];
  checked += unique.length;

  for (const name of unique) {
    if (!documented.has(name)) {
      failures.push(`${surface}: ${name} has no doc block`);
    }
  }
}

// Guards the check itself: an empty or renamed surface must not pass silently.
if (checked === 0) {
  failures.push('no declarations found in the published type surface');
}

for (const failure of failures) console.error(`  ${failure}`);
console.log(`checked ${checked} declaration(s) in the published type surface`);
process.exit(failures.length > 0 ? 1 : 0);
