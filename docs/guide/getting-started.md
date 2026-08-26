# Getting started

aathena reads your AWS Glue catalog and generates a typed TypeScript function
for every SQL file you write. You keep writing SQL; the types come from the
catalog rather than from hand-written interfaces that drift.

## Install

```bash
npm install aathena
```

Node 20 or later. AWS credentials are resolved by the standard SDK chain, so
whatever already works for the AWS CLI works here.

## Scaffold a project

```bash
npx aathena init
```

`init` is interactive and does the whole setup in one pass:

1. Resolves the AWS region from `--region`, the `AWS_REGION` /
   `AWS_DEFAULT_REGION` environment variables, or a prompt.
2. Lists your Glue databases and Athena workgroups, and inherits the
   workgroup's default output location when it has one.
3. Writes `aathena.config.json` and adds `node_modules/` to `.gitignore`.
4. Lets you multi-select which tables to scaffold starter SQL for.
5. Probes each table, following Presto/Trino views to the tables underneath,
   for injected-projection partitions that need a `WHERE` predicate.
6. Writes `tables/{database}/{table}/default.sql` with the right `-- @param`
   and `WHERE` lines.
7. Runs `generate` to produce the typed query functions.
8. Writes a runnable `src/main.ts` that calls every scaffolded query.

Every prompt has a flag, so `init` also runs unattended:

```bash
npx aathena init --region eu-west-1 --database sampledb --tables events,users
```

## Run it

```bash
npx tsx src/main.ts
```

If a scaffolded query needs partition values, `main.ts` passes `REPLACE_ME`
placeholders with a note at the top of the file. Replace them with real values
first.

## What you get

A query is one `.sql` file, and codegen turns it into one exported function
with a typed parameter object and a typed result:

<<< @/../examples/basic/tables/sampledb/orders/detail.sql{sql}

becomes:

<<< @/../examples/basic/generated/queries/sampledb/orders/detail.ts

bound to a row type read straight from Glue:

<<< @/../examples/basic/generated/types/sampledb/orders.ts

Both files are real output from the example project in this repository, and
both are typechecked in CI.

## Next

- [Writing queries](./writing-queries.md) - placeholders, `@param` annotations
- [Running queries](./running-queries.md) - the client, typed rows, debugging
