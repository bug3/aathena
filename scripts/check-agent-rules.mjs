// Asserts that the rule list in the agent skill is the rule list in
// context7.json, verbatim and in order.
//
// The same handful of sentences has to reach agents through two unrelated
// channels: Context7 serves context7.json `rules` to anyone who queries the
// library, and the skill is copied onto a developer's machine by
// `gh skill install`. Written twice, they drift, and the drift is invisible
// because no one reads both copies at once.
//
// context7.json is the canonical home. It is data, it is already committed,
// and Context7 serves it whether or not the skill exists. The skill quotes it
// under a marker, and this check keeps the quote honest.
//
// Usage in SKILL.md:
//
//     <!-- rules: context7.json -->
//     - ...first rule, verbatim...
//     - ...second rule, verbatim...

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL = 'skills/aathena/SKILL.md';
const MARKER = '<!-- rules: context7.json -->';

const rules = JSON.parse(readFileSync(join(REPO, 'context7.json'), 'utf8')).rules ?? [];
const lines = readFileSync(join(REPO, SKILL), 'utf8').split('\n');
const failures = [];

const start = lines.indexOf(MARKER);
if (start === -1) {
  failures.push(`${SKILL}: no ${MARKER} marker`);
} else if (rules.length === 0) {
  failures.push('context7.json declares no rules, so the skill quotes nothing');
} else {
  // The block runs from the marker to the first line that is not a bullet, so
  // an added or removed bullet is caught by the length comparison below rather
  // than silently shifting the pairing.
  let end = start + 1;
  while (end < lines.length && lines[end].startsWith('- ')) end++;
  const quoted = lines.slice(start + 1, end).map((line) => line.slice(2));

  if (quoted.length !== rules.length) {
    failures.push(
      `${SKILL}: quotes ${quoted.length} rule(s), context7.json declares ${rules.length}`,
    );
  }

  for (let i = 0; i < Math.min(quoted.length, rules.length); i++) {
    if (quoted[i] !== rules[i]) {
      failures.push(
        `${SKILL}:${start + 2 + i}: rule ${i + 1} does not match context7.json\n` +
          `      skill: ${quoted[i]}\n` +
          `      json:  ${rules[i]}`,
      );
    }
  }
}

for (const failure of failures) console.error(`  ${failure}`);
console.log(`checked ${rules.length} rule(s) in ${SKILL} against context7.json`);
process.exit(failures.length > 0 ? 1 : 0);
