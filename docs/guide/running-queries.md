---
description: "Call generated query functions, read typed rows, run queries concurrently with parallel(), and handle Athena errors."
---

# Running queries

Every generated query is a function that takes a client and its typed
parameters.

<<< @/snippets/run-a-query.ts

`createClient()` with no argument finds `aathena.config.json` by walking up
from the current working directory. Pass a config to override it, which is
what you want in tests or when the project root is not on disk:

<<< @/snippets/explicit-config.ts

## Rows are typed from the catalog

Column names are emitted exactly as Glue reports them - no camelCasing, no
renaming - so a row object matches the table it came from. Scalars land as
native TypeScript, and Parquet/ORC arrays, maps and structs are parsed back
recursively, even nested:

<<< @/snippets/typed-rows.ts

Note the nullability. Athena guarantees `NOT NULL` only for partition keys, so
`dt` is the one column above typed without `| null`. That is a rule worth
internalising early: it is what stops `row.address.city` from compiling and
sends you to `row.address?.city` instead.

See [Type mapping](../reference/type-mapping.md) for the full table.

## Retries

`client.query()` retries `StartQueryExecution` with exponential backoff and
full jitter when Athena answers `TooManyRequestsException` or
`CONCURRENT_QUERY_LIMIT_EXCEEDED`, up to 6 attempts. This applies to every
call - generated or inline - including the tasks dispatched by `parallel()`.

## Debugging: export the rendered SQL

Pass `{ exportTo: <path> }` as the optional third argument to write the
rendered SQL, with parameter values substituted, to disk:

<<< @/snippets/export-sql.ts

The query still executes. Missing parent directories are created, and the file
is overwritten on each call.

## Running queries concurrently

`parallel()` runs several queries at once under a bounded cap that respects
Athena's per-account active-DML quota. Tasks are thunks rather than promises,
so the helper controls when each query actually starts:

<<< @/snippets/parallel-queries.ts

With `concurrency: 'auto'`, the cap is resolved in this order:

1. `AathenaConfig.maxConcurrency`, if set.
2. A live AWS Service Quotas lookup (`L-D405C694` for DML, `L-FCDFE414` for
   DDL). This uses `@aws-sdk/client-service-quotas`, an optional dependency
   loaded by dynamic import, and needs the `servicequotas:GetServiceQuota` IAM
   permission. Without it the lookup fails quietly and the next step applies.
3. A region-aware conservative fallback: half the AWS-documented default,
   clamped to `[5, 25]`.

| Option | Default | Meaning |
| --- | --- | --- |
| `concurrency` | `5` | a number, or `'auto'` |
| `client` | - | required when `concurrency: 'auto'` and `maxConcurrency` is unset |
| `kind` | `'dml'` | `'dml'` or `'ddl'`, selects which quota to probe |
| `reserveHeadroom` | `1` | subtracted from the resolved quota |
| `mode` | `'all'` | `'all'` rejects on the first failure; `'allSettled'` returns per-task settlements |

## Errors

Everything aathena throws extends `AathenaError`, so you can catch the
specific cases you handle and let the rest fall through:

<<< @/snippets/error-handling.ts

| Class | Thrown when |
| --- | --- |
| `QueryTimeoutError` | the query exceeded the configured timeout; carries `timeoutMs` and `queryExecutionId` |
| `QueryFailedError` | Athena reported a failure; carries `athenaErrorMessage` |
| `QueryCancelledError` | the execution was cancelled |
| `ColumnParseError` | a returned value did not parse as its declared column type |
| `AathenaError` | the base class for all of the above |

## Next

- [Configuration](../reference/configuration.md) - every field of `aathena.config.json`
- [Type mapping](../reference/type-mapping.md) - Athena types to TypeScript
