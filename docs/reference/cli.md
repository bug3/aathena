---
description: "Reference for aathena init, add, and generate, with every flag."
---

# CLI reference

| Command | Purpose |
| --- | --- |
| `aathena init` | interactive project scaffold: fills config from AWS, picks tables, probes partitions, runs generate, writes `src/main.ts` |
| `aathena add <table>` | scaffold a new query under `tables/{database}/{table}/<name>.sql` |
| `aathena generate` | re-run codegen: fetch Glue schemas, produce typed query functions |
| `aathena skill` | write the aathena agent skill into this project's agent directories |
| `aathena help` | show every flag |

## `aathena init`

Interactive by default. The full sequence is in
[Getting started](../guide/getting-started.md).

| Flag | Effect |
| --- | --- |
| `--region`, `--database`, `--workgroup`, `--output-location` | non-interactive overrides |
| `--tables a,b,c` | comma-separated tables, skips the multi-select |
| `--tables-dir <path>` | SQL scaffold root, default `tables`; persisted to `config.tablesDir` |
| `--out-dir <path>` | codegen output directory, default `generated`; persisted to `config.outDir` |
| `--example-path <path>` | runnable starter file, default `src/main.ts`; the `from '../generated'` import is rewritten to match `--out-dir` |
| `--no-sample` | skip SQL scaffolding |
| `--no-generate` | skip the auto-generate step |
| `--no-example` | skip writing the example file |
| `--force` | overwrite `aathena.config.json` and regenerate the example file. SQL files are always preserved, because you may have edited them |

## `aathena add`

```bash
npx aathena add events                  # tables/{config.database}/events/default.sql
npx aathena add sales.events            # cross-database; a prompt resolves the mismatch
npx aathena add events --from-schema    # embed the Glue column list as a comment block
npx aathena add events --name daily     # scaffold daily.sql instead of default.sql
```

`add` always probes partitions, even without `--from-schema`, and auto-runs
`generate` unless `--no-generate`.

| Flag | Effect |
| --- | --- |
| `--name <query-name>` | query filename, default `default` |
| `--from-schema` | include the Glue column list as a comment block |
| `--force` | overwrite an existing SQL file |
| `--no-generate` | skip the auto-generate step |

## `aathena skill`

Copies the agent skill shipped inside the package into the directories a coding
agent scans, so it is read on the next session:

| Path | When |
| --- | --- |
| `.agents/skills/aathena/SKILL.md` | always; the vendor-neutral convention that Codex, Cursor, Copilot, Gemini CLI and OpenCode all read |
| `.claude/skills/aathena/SKILL.md` | when the project already has a `.claude` directory |

Idempotent: a file already holding the current skill is left alone. A file
holding an older one is replaced, not merged, because the package owns it.

`init` offers the same thing at the end of its run. Accept it there with
`--skill` or skip it with `--no-skill`.

For an agent that reads its own vendor directory, such as Grok or Devin, use
GitHub's installer instead, which knows every agent's layout:

```bash
gh skill install bug3/aathena
```

## `aathena generate`

Fetches Glue schemas for every SQL file under `tables/` in parallel and writes
`generated/types/{database}/{table}.ts`,
`generated/queries/{database}/{table}/{query}.ts` and the barrel
`generated/index.ts`. Run it after editing SQL files or when upstream schemas
change.

It prints a one-line notice when a query directory's database differs from
`config.database` and a per-query binding is emitted.
