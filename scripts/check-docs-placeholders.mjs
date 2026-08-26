// Guards documentation pages against Vue swallowing `{{ }}`.
//
// VitePress compiles markdown as a Vue template, so `{{ x }}` outside a fenced
// code block is an interpolation - including inside inline backticks. This
// package documents `{{placeholder}}` syntax constantly, and the failure is
// silent: `{{name}}` is a valid expression, so the build stays green and the
// page renders an empty <code></code>. `{{<column>}}` is not valid and fails
// the build instead, which is how this was found.
//
// The rule: outside fenced code blocks, `{{` is only allowed inside a v-pre
// element.
//
//     bad   Placeholders use `{{name}}` syntax.
//     good  Placeholders use <code v-pre>{{name}}</code> syntax.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(REPO, 'docs');

function markdownFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === '.vitepress' || entry === 'snippets') return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return markdownFiles(path);
    return path.endsWith('.md') ? [path] : [];
  });
}

const failures = [];
let scanned = 0;

for (const file of markdownFiles(DOCS)) {
  scanned++;
  let inFence = false;

  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      return;
    }
    if (inFence || !line.includes('{{')) return;
    if (line.includes('v-pre')) return;
    failures.push(
      `${relative(REPO, file)}:${i + 1}: '{{' outside a fenced block and outside v-pre`,
    );
  });
}

if (scanned === 0) failures.push('no markdown pages found under docs/');

for (const failure of failures) console.error(`  ${failure}`);
console.log(`scanned ${scanned} documentation page(s) for unescaped placeholders`);
process.exit(failures.length > 0 ? 1 : 0);
