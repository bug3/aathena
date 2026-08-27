---
name: aathena
description: "Build type-safe AWS Athena (Amazon Athena) integrations in TypeScript with the aathena npm package: generate typed query functions and row types from an AWS Glue catalog, validate SQL parameters before submission, parse Athena arrays, maps and structs, and bound query concurrency. Use when a project depends on aathena, when generating TypeScript types from AWS Glue schemas, or when writing or debugging Athena queries in TypeScript."
license: MIT
metadata:
  author: bug3
---

# Use aathena

`aathena` reads an AWS Glue catalog and generates one typed TypeScript function
per SQL file. Column names and types come from the catalog verbatim, parameters
are validated before the query is submitted, and Athena's string-encoded arrays,
maps and structs are parsed back into real objects.

## Decide fit

Use aathena when the project queries Athena from TypeScript and benefits from
types derived from the real catalog, when rows carry complex Athena types that
would otherwise need hand-written parsing, or when several queries must run
concurrently under a quota.

Prefer `@aws-sdk/client-athena` directly for a one-off untyped query, for
Athena features aathena does not wrap (workgroup administration, named queries,
notebooks), or when there is no Glue catalog to generate from.

## Establish the local truth first

Read before proposing. The installed package is the authority, not memory:

1. `package.json` for the installed aathena version.
2. `aathena.config.json` for `database`, `tablesDir` and `outDir`.
3. The generated barrel (`<outDir>/index.ts`) for the query functions that
   already exist.
4. `node_modules/aathena/dist/index.d.ts` for the exported API and its JSDoc.

Never invent a convenience method. If a declaration does not exist in the
installed types, it does not exist.

## Rules

These are the maintainer rules, kept identical to `context7.json` in the aathena
repository.

<!-- rules: context7.json -->
- Column names come from the AWS Glue catalog verbatim. Access them exactly as the table declares them, for example row.event_id, never row.eventId.
- Only partition keys are NOT NULL. Every regular column is typed T | null, so guard struct and array access: row.address?.city, not row.address.city.
- Import the generated query functions from the generated barrel and call them. Do not hand-write createQuery calls; run `aathena add` and `aathena generate` instead.
- parallel() takes thunks, not promises: parallel([() => byStatus(client, params)], { concurrency: 'auto', client }).
- SQL placeholders are {{name}}. Declare parameter types with -- @param annotations in the SQL file, which validate before the query is submitted.
- Never hardcode AWS credentials. createClient() reads aathena.config.json and resolves credentials through the standard AWS SDK chain.

## The workflow

Generation is a CLI step, not something to hand-write:

- `npx aathena init` scaffolds a project against a live Glue catalog.
- `npx aathena add` adds a table and a starter SQL file.
- `npx aathena generate` regenerates types and query functions from the SQL.

Generated files are committed. When they look stale, regenerate and commit the
result rather than editing them by hand.

Calling a generated query:

<!-- snippet: run-a-query.ts -->
```typescript
import { createClient } from 'aathena';
import { byStatus } from './generated';

const athena = createClient();
const result = await byStatus(athena, { status: 'active', rowLimit: 99 });
```

## Validate

Run the project's own TypeScript check after any change to SQL, configuration or
generated output. Type errors in generated code almost always mean the SQL and
the catalog have drifted apart, so regenerate before debugging the types.

## Safety

Athena bills by bytes scanned, so a query missing a partition predicate can scan
an entire table. Say so before running one. Never hardcode AWS credentials:
`createClient()` reads `aathena.config.json` and resolves credentials through
the standard AWS SDK chain. Ask before executing any live query.

## Reference

Full documentation: <https://bug3.github.io/aathena/>

- Getting started: <https://bug3.github.io/aathena/guide/getting-started>
- Writing queries: <https://bug3.github.io/aathena/guide/writing-queries>
- Running queries: <https://bug3.github.io/aathena/guide/running-queries>
- Partitions and views: <https://bug3.github.io/aathena/guide/partitions>
- API surface: <https://bug3.github.io/aathena/reference/api>
- Type mapping: <https://bug3.github.io/aathena/reference/type-mapping>
- Configuration: <https://bug3.github.io/aathena/reference/configuration>
