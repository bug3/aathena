#!/usr/bin/env bash
# Smoke-test the packed tarball rather than the working tree.
#
# `typecheck:examples` compiles the examples against `src/` through tsconfig
# path mappings, so nothing else in CI exercises what consumers actually
# install: the `exports` map, the emitted declarations and the CJS build. This
# installs the real tarball into a throwaway project and checks that both entry
# points resolve under every modern resolver and load at runtime in both formats.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$(mktemp -d)"
cleanup() {
  if [ -n "${WORK:-}" ] && [ -d "$WORK" ]; then
    rm -rf "$WORK"
  fi
}
trap cleanup EXIT

# One canonical home for the TypeScript version: the repo's own devDependency.
TS_SPEC="typescript@$(node -p "require('$REPO/package.json').devDependencies.typescript")"

# npm pack does not create the destination directory.
mkdir -p "$WORK/pack"
TARBALL_NAME="$(cd "$REPO" && npm pack --json --pack-destination "$WORK/pack" \
  | node -p "JSON.parse(require('node:fs').readFileSync(0, 'utf8'))[0].filename")"
TARBALL="$WORK/pack/$TARBALL_NAME"
echo "packed $TARBALL_NAME"

CONSUMER="$WORK/consumer"
mkdir -p "$CONSUMER"
cd "$CONSUMER"
cat > package.json <<'JSON'
{
  "name": "aathena-smoke-consumer",
  "version": "1.0.0",
  "private": true,
  "type": "module"
}
JSON
npm install --no-audit --no-fund --loglevel=error "$TARBALL" "$TS_SPEC"

cat > probe.ts <<'TS'
import { createClient, createQuery, parallel, schema } from 'aathena';
import type { AathenaConfig, QueryResult } from 'aathena';
import { findProjectRoot } from 'aathena/runtime';

export const config: AathenaConfig | null = null;
export const surface = [createClient, createQuery, parallel, schema, findProjectRoot];
export type Row = QueryResult<{ id: string }>;
TS

# `node10` is deliberately absent: it predates `exports`, so by design it cannot
# resolve the `aathena/runtime` subpath.
for RESOLUTION in bundler node16 nodenext; do
  MODULE="$RESOLUTION"
  [ "$RESOLUTION" = bundler ] && MODULE=preserve
  cat > tsconfig.json <<JSON
{
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "target": "es2022",
    "module": "$MODULE",
    "moduleResolution": "$RESOLUTION",
    "skipLibCheck": true
  },
  "include": ["probe.ts"]
}
JSON
  echo "typecheck moduleResolution=$RESOLUTION"
  npx --no-install tsc -p tsconfig.json
done

cat > probe.mjs <<'MJS'
import { createClient } from 'aathena';
import { findProjectRoot } from 'aathena/runtime';

if (typeof createClient !== 'function' || typeof findProjectRoot !== 'function') {
  throw new Error('esm entry points did not export the expected functions');
}
MJS

cat > probe.cjs <<'CJS'
const root = require('aathena');
const runtime = require('aathena/runtime');

if (typeof root.createClient !== 'function' || typeof runtime.findProjectRoot !== 'function') {
  throw new Error('cjs entry points did not export the expected functions');
}
CJS

echo "load esm"
node probe.mjs
echo "load cjs"
node probe.cjs

# The `aathena skill` command copies a file out of the installed package, so it
# breaks in exactly two ways nothing else here would catch: `files` dropping
# `skills`, and the path from dist/cli/ to the package root changing. Both look
# fine in the working tree, where the same relative path happens to resolve.
echo "skill materializes from the installed package"
mkdir -p project && cd project
node ../node_modules/aathena/dist/cli/index.js skill
test -f .agents/skills/aathena/SKILL.md \
  || { echo "aathena skill wrote no .agents/skills/aathena/SKILL.md" >&2; exit 1; }
diff ../node_modules/aathena/skills/aathena/SKILL.md .agents/skills/aathena/SKILL.md \
  || { echo "materialized skill differs from the packaged one" >&2; exit 1; }
cd ..

echo "smoke ok"
