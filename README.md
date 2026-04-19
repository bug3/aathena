# aathena

[![CI](https://github.com/bug3/aathena/actions/workflows/ci.yml/badge.svg)](https://github.com/bug3/aathena/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/aathena)](https://www.npmjs.com/package/aathena)
[![license](https://img.shields.io/npm/l/aathena)](LICENSE)
[![node](https://img.shields.io/node/v/aathena)](package.json)

Type-safe AWS Athena client for TypeScript. Write SQL, run codegen, get fully typed query functions.

- Write SQL files with `{{variable}}` placeholders
- Scaffold a project from AWS with `npx aathena init`
- Fully type-safe parameters and results, sourced from your AWS Glue catalog
- Run queries concurrently with `parallel()`, which respects Athena's per-account service quota

Built on [@aws-sdk/client-athena](https://www.npmjs.com/package/@aws-sdk/client-athena) and [sql-render](https://github.com/bug3/sql-render). See the [`examples/`](examples/) directory for a working project structure.

## Quick Start (under 60 seconds)

### 1. Install

```bash
npm install aathena
```

### 2. Initialize

```bash
npx aathena init
```

`init` reads your AWS credentials, lists your Glue databases and Athena workgroups, and writes `aathena.config.json` + a starter SQL file under `tables/`. The `--force` flag overwrites an existing config; pass `--region`, `--database`, `--workgroup`, `--output-location` for non-interactive use (CI/automation).

### 3. Use it

```typescript
import { createClient } from 'aathena';
import { events } from './generated';

const athena = createClient();
const result = await events(athena, {});

result.rows[0].event_id;    // fully typed from Glue schema
result.rows[0].created_at;  // Date
```

## Commands

| Command | Purpose |
|---|---|
| `aathena init` | Interactive project scaffold. Fills config from AWS (region, Glue databases, Athena workgroups, workgroup output location). |
| `aathena add <table>` | Scaffold a new query under `tables/{database}/{table}/<name>.sql`. Accepts `db.table` for cross-database tables and prompts to resolve mismatches. |
| `aathena generate` | Re-run codegen (fetch Glue schemas, produce typed query functions). Runs automatically after `add` unless `--no-generate`. |
| `aathena help` | Show all flags. |

### Add flags

- `--name <query-name>` - query filename (default: `default`)
- `--from-schema` - include Glue column list as a comment block
- `--force` - overwrite an existing SQL file
- `--no-generate` - skip the auto-generate step

## Writing SQL

Queries live under `tables/{database}/{table}/{query-name}.sql`. The file path drives two things:

1. **Which Glue table** codegen fetches the schema from (for result types)
2. **Which database** the query runs against at runtime (the directory database is used even if it differs from your project's primary `config.database`)

Placeholders use `{{name}}` syntax. Types are inferred from context:

```sql
WHERE status = '{{status}}'    -- quoted       -> string
LIMIT {{limit}}                -- LIMIT/OFFSET -> number (positiveInt)
WHERE price >= {{minPrice}}    -- comparison   -> number
```

For stricter validation, annotate with `-- @param`:

```sql
-- @param status enum('active','pending','done')
-- @param limit positiveInt
-- @param startDate isoDate
SELECT *
FROM events
WHERE status = '{{status}}'
  AND created_at >= '{{startDate}}'
LIMIT {{limit}}
```

Generates:

```typescript
interface DefaultParams {
  status: 'active' | 'pending' | 'done';
  limit: number;                  // validated > 0
  startDate: string;              // validated YYYY-MM-DD
}
```

### Available `@param` types

| Annotation | TypeScript | Validation |
|---|---|---|
| `string` | `string` | SQL injection check |
| `number` | `number` | Finite number |
| `boolean` | `boolean` | `true` / `false` |
| `positiveInt` | `number` | Integer > 0 |
| `isoDate` | `string` | `YYYY-MM-DD` |
| `isoTimestamp` | `string` | ISO 8601 |
| `identifier` | `string` | SQL identifier |
| `uuid` | `string` | RFC 4122 UUID |
| `s3Path` | `string` | `s3://bucket/path` |
| `enum('a','b','c')` | `'a' \| 'b' \| 'c'` | Whitelist |

## Type Mapping

Glue column types map directly to TypeScript:

| Athena | TypeScript | Notes |
|---|---|---|
| `varchar`, `string`, `char` | `string` | |
| `integer`, `int`, `smallint`, `tinyint` | `number` | |
| `bigint` | `bigint` | |
| `double`, `float`, `real` | `number` | |
| `decimal` | `string` | Preserves precision |
| `boolean` | `boolean` | |
| `date` | `string` | `YYYY-MM-DD` |
| `timestamp` | `Date` | |
| `json` | `unknown` | |
| `binary`, `varbinary` | `string` | Base64 encoded |
| `array<T>` | `T[]` | Recursive |
| `map<K, V>` | `Record<K, V>` | Recursive |
| `struct<a:T, b:U>` | `{ a: T; b: U }` | Recursive |

### Complex types handled automatically

Athena returns every value as a flat string at the SDK level, even when the underlying Parquet/ORC columns are native arrays, maps, or structs. aathena parses them back to native shapes recursively - no `CAST()`, extra views, or manual `JSON.parse` required.

```typescript
// Glue: tags array<varchar>, metadata map<string,integer>, address struct<city:string,zip:integer>
row.tags;            // string[]
row.metadata;        // Record<string, number>
row.address;         // { city: string; zip: number }
row.address.city;    // string, direct access
```

## Running Queries in Parallel

`parallel()` runs multiple queries concurrently with a bounded cap that respects Athena's per-account active-DML quota. Tasks are passed as thunks (`() => query(...)`) so the helper can gate when each query actually starts.

```typescript
import { createClient, parallel } from 'aathena';
import { getUsers, getOrders } from './generated';

const athena = createClient();

const [users, orders] = await parallel(
  [
    () => getUsers(athena, { limit: 100 }),
    () => getOrders(athena, { from: '2026-01-01' }),
  ],
  { concurrency: 'auto', client: athena },
);
```

### Concurrency resolution

`concurrency` accepts a number or `'auto'`. With `'auto'`, the cap is resolved in this order:

1. `AathenaConfig.maxConcurrency` if set
2. Live AWS Service Quotas lookup (`L-D405C694` DML, `L-FCDFE414` DDL)
3. Region-aware conservative fallback (50% of AWS-documented default, clamped to `[5, 25]`)

The live lookup uses `@aws-sdk/client-service-quotas`, an optional dependency loaded via dynamic import. It requires the `servicequotas:GetServiceQuota` IAM permission; without it the lookup fails silently and the fallback is used.

### Options

| Option | Default | Description |
|---|---|---|
| `concurrency` | `5` | `number` or `'auto'` |
| `client` | - | Required when `concurrency: 'auto'` and `maxConcurrency` is unset |
| `kind` | `'dml'` | `'dml'` or `'ddl'`, selects which quota to probe |
| `reserveHeadroom` | `1` | Subtracted from the resolved quota |
| `mode` | `'all'` | `'all'` rejects on first failure; `'allSettled'` returns per-task settlements |

### Automatic retry on throttling

`client.query()` (and anything built on it) retries `StartQueryExecution` with exponential backoff + full jitter when Athena responds with `TooManyRequestsException / CONCURRENT_QUERY_LIMIT_EXCEEDED`. Up to 6 attempts. Works whether or not you use `parallel()`.

## Config

`aathena.config.json` lives at your project root. `init` writes it for you; edit as needed afterwards. Both the CLI and runtime walk up the directory tree to find it.

```json
{
  "region": "eu-west-1",
  "database": "sampledb",
  "workgroup": "primary",
  "outputLocation": "s3://my-bucket/athena-results/",
  "tablesDir": "./tables",
  "outDir": "./generated",
  "query": {
    "timeout": 300000,
    "pollingInterval": 500,
    "maxPollingInterval": 5000
  }
}
```

| Field | Default | Description |
|---|---|---|
| `region` | AWS default | AWS region |
| `database` | *required* | Primary Athena database (used when a query's directory doesn't specify otherwise) |
| `workgroup` | - | Athena workgroup |
| `outputLocation` | - | S3 path for query results (optional if workgroup has a default) |
| `tablesDir` | `./tables` | SQL files directory |
| `outDir` | `./generated` | Codegen output directory |
| `query.timeout` | `300000` | Query timeout in ms (5 min) |
| `query.pollingInterval` | `500` | Initial poll interval in ms |
| `query.maxPollingInterval` | `5000` | Max poll interval in ms |
| `maxConcurrency` | - | Override for `parallel({ concurrency: 'auto' })` when Service Quotas is unreachable |

## Query Statistics

Every `QueryResult` includes a `statistics` block from Athena (cost tracking, queueing visibility, cache hits). Pass `{ includeRuntimeStats: true }` for input/output row counts via an extra `GetQueryRuntimeStatistics` API call.

```typescript
const result = await athena.query<Row>(sql, { includeRuntimeStats: true });
result.statistics.totalExecutionTimeInMillis;   // 8128
result.statistics.resultReused;                 // true
result.statistics.runtime?.outputRows;          // 99
```

| Field | Notes |
|---|---|
| `engineExecutionTimeInMillis` | Engine execution time |
| `totalExecutionTimeInMillis` | Wall time Athena took |
| `queryQueueTimeInMillis` | Time spent waiting in the queue |
| `queryPlanningTimeInMillis` | Planning + partition retrieval |
| `servicePreProcessingTimeInMillis` | Preprocessing before engine |
| `serviceProcessingTimeInMillis` | Result publication |
| `dataScannedInBytes` | Drives query cost |
| `dpuCount?` | Capacity-reservation workgroups only |
| `resultReused?` | True if served from result cache |
| `runtime?.inputRows` / `inputBytes` | Opt-in via `includeRuntimeStats` |
| `runtime?.outputRows` / `outputBytes` | Opt-in via `includeRuntimeStats` |

## Cross-Database Queries

By default every query runs against `config.database`. When a SQL file lives in `tables/{other-db}/...` (different from `config.database`), `generate` automatically emits an explicit per-query binding so it routes to that database at runtime:

```typescript
// generated/queries/sales/events/default.ts (primary config.database is 'marketing')
export const default_ = createQuery<Events, DefaultParams>(
  'tables/sales/events/default.sql',
  schemaDef,
  { database: 'sales' },
);
```

You don't write this yourself - `add <db>.<table>` and `generate` handle it. Use `client.query(sql, { database: 'sales' })` for the same effect on ad-hoc inline queries.

## Directory Structure

```
project/
├── aathena.config.json        # project root marker, written by 'init'
├── tables/                    # SQL files
│   └── sampledb/              # database
│       └── events/            # table
│           ├── default.sql
│           └── daily.sql
├── generated/                 # codegen output (gitignored)
└── src/
```

Nested grouping under a table (e.g. `events/cart/add.sql`) works too - codegen walks the whole tree under `tables/`.

## Error Handling

```typescript
import {
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
  ColumnParseError,
} from 'aathena';

try {
  const result = await events(athena, { status: 'active', limit: 99 });
} catch (err) {
  if (err instanceof QueryTimeoutError) {
    console.log(`Timed out after ${err.timeoutMs}ms: ${err.queryExecutionId}`);
  }
  if (err instanceof QueryFailedError) {
    console.log(`Athena error: ${err.athenaErrorMessage}`);
  }
}
```

## Requirements

- Node.js >= 20
- AWS credentials resolvable via the default provider chain (env, shared config, SSO, IAM role, etc.)
- IAM permissions:
  - `athena:StartQueryExecution`, `athena:GetQueryExecution`, `athena:GetQueryResults` (runtime)
  - `athena:ListWorkGroups`, `athena:GetWorkGroup` (init)
  - `glue:GetDatabases`, `glue:GetTables`, `glue:GetTable` (init, add, generate)
  - `servicequotas:GetServiceQuota` (optional, enables `parallel({ concurrency: 'auto' })`)
  - Your query's S3 read + output-bucket write permissions

## Related

- [sql-render](https://github.com/bug3/sql-render) - type-safe SQL templating with injection protection (used internally)

## For LLMs

Two machine-readable summaries are maintained for AI consumption, following the [llms.txt](https://llmstxt.org) convention:

- [llms.txt](llms.txt) - curated API reference and usage guide
- [llms-full.txt](llms-full.txt) - full packed source, auto-generated on each push

## License

[MIT](LICENSE)
