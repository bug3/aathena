---
description: "Everything exported from aathena and aathena/runtime: the client, createQuery, parallel, schema, and the error classes."
---

# API surface

Two entry points export the same surface. `aathena` is what you import;
`aathena/runtime` is what generated code imports, and exists so a bundled
deploy can pull in the runtime without the CLI.

```typescript
import { createClient, createQuery, parallel, schema } from 'aathena';
import { createQuery, schema } from 'aathena/runtime';
```

## Values

| Export | What it is |
| --- | --- |
| `createClient` | creates a client, reading `aathena.config.json` unless you pass a config |
| `AathenaClient` | the client class behind `createClient` |
| `createQuery` | binds a SQL template to its types; codegen writes these for you |
| `parallel` | bounded-concurrency runner for several queries |
| `schema` | parameter validation descriptors, re-exported from sql-render |
| `defineConfig` | config helper with type checking |
| `findProjectRoot` | walks up to the nearest `aathena.config.json`. `aathena/runtime` only |

## Errors

Every one extends `AathenaError`, so a single `instanceof AathenaError` catches
anything aathena threw.

| Class | Carries |
| --- | --- |
| `AathenaError` | the base class |
| `QueryTimeoutError` | `queryExecutionId`, `timeoutMs` |
| `QueryFailedError` | `queryExecutionId`, `athenaErrorMessage` |
| `QueryCancelledError` | `queryExecutionId` |
| `ColumnParseError` | `column`, `value`, `expectedType` |

See [Running queries](../guide/running-queries.md#errors) for how to branch on
them.

## Types

`AathenaConfig`, `QueryResult`, `QueryStatistics`, `QueryRuntimeRows`,
`QueryOptions`, `ColumnMeta`, `ParallelOptions`, `QuotaKind`,
`CreateQueryOptions`, `RenderOptions`.

`QueryStatistics` and `QueryRuntimeRows` are documented under
[Query statistics](./query-statistics.md); `AathenaConfig` under
[Configuration](./configuration.md).

## Cross-database queries

When a SQL file lives under `tables/{directory-db}/...` and `directory-db`
differs from `config.database`, codegen emits an explicit per-call binding so
the query routes correctly. You do not write it: `aathena add <db>.<table>`
scaffolds under the right directory and `generate` does the rest.

For an ad-hoc inline query, `client.query(sql, { database: 'sales' })`
overrides `config.database` for that call alone.
