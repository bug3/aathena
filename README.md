# aathena

[![CI](https://github.com/bug3/aathena/actions/workflows/ci.yml/badge.svg)](https://github.com/bug3/aathena/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/aathena)](https://www.npmjs.com/package/aathena)
[![license](https://img.shields.io/npm/l/aathena)](LICENSE)
[![node](https://img.shields.io/node/v/aathena)](package.json)

Type-safe AWS Athena client for TypeScript.

- Scaffold a project from AWS with `npx aathena init`
- Edit scaffolded SQL files with `{{variable}}` placeholders
- Fully type-safe parameters and results, sourced from your AWS Glue catalog
- Auto-detects injected-projection partitions (including those hidden behind Presto/Trino views) and scaffolds the required WHERE predicates for you
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

`init` walks you through a complete setup:

1. Reads AWS credentials, lists Glue databases and Athena workgroups, inherits the workgroup's default output location when available
2. Writes `aathena.config.json` and adds `generated/` + `node_modules/` to `.gitignore`
3. Lets you multi-select which tables to scaffold starter SQL for
4. Probes each selected table (and any Presto/Trino view it points at) for injected-projection partitions that require WHERE predicates
5. Writes `tables/{db}/{table}/default.sql` with `LIMIT {{limit}}`, plus the right `-- @param` / `WHERE` lines
6. Runs `generate` to produce typed query functions under `generated/`
7. Writes a runnable `src/main.ts` that imports and calls every scaffolded query (single call for 1 table, `parallel()` demo for 2+)

Non-interactive flags: `--region`, `--database`, `--workgroup`, `--output-location`, `--tables a,b,c`.

Opt-outs: `--no-sample` (skip SQL scaffolding), `--no-generate` (skip auto-generate), `--no-example` (skip `src/main.ts`).

Re-run: `--force` overwrites `aathena.config.json` and regenerates `src/main.ts` to reflect the current selection. SQL files are always preserved because you may have edited them.

### 3. Run it

```bash
npx tsx src/main.ts
```

If any scaffolded query needs partition values, `main.ts` passes `REPLACE_ME` placeholders with a note at the top of the file. Replace them with real values, then run.

## Adding more queries

```bash
npx aathena add events                  # tables/{config.db}/events/default.sql
npx aathena add sales.events            # cross-db; interactive prompt resolves mismatch
npx aathena add events --from-schema    # embed Glue column list as a comment block
npx aathena add events --name daily     # scaffold daily.sql instead of default.sql
```

`add` always probes partitions (even without `--from-schema`) and auto-runs `generate` unless `--no-generate`.

## Commands

| Command | Purpose |
|---|---|
| `aathena init` | Interactive project scaffold. Fills config from AWS, picks tables, probes partitions, runs generate, writes `src/main.ts`. |
| `aathena add <table>` | Scaffold a new query under `tables/{database}/{table}/<name>.sql`. Accepts `db.table` for cross-database tables and prompts to resolve mismatches. |
| `aathena generate` | Re-run codegen (fetch Glue schemas, produce typed query functions). Runs automatically after `init` and `add` unless `--no-generate`. |
| `aathena help` | Show all flags. |

### Add flags

- `--name <query-name>` - query filename (default: `default`)
- `--from-schema` - include Glue column list as a comment block
- `--force` - overwrite an existing SQL file
- `--no-generate` - skip the auto-generate step

## Editing SQL

Your scaffolded queries live under `tables/{database}/{table}/{query-name}.sql`. Open the file `init` (or `add`) created and shape it to your needs. Placeholders use `{{name}}` syntax. Types are inferred from SQL context:

```sql
WHERE status = '{{status}}'    -- quoted       -> string
LIMIT {{limit}}                -- LIMIT/OFFSET -> positiveInt
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

### Generated export names

The barrel at `generated/index.ts` re-exports every query under a JS-safe identifier:

- `latest.sql` -> `latest`
- `default.sql` (JS reserved word) -> aliased as `<table>Default`, e.g. `eventsDefault`
- Two queries with the same filename across tables -> aliased as `<table>{Query}` on both sides

So a scaffolded `tables/sampledb/events/default.sql` shows up as:

```typescript
import { eventsDefault } from './generated';
const result = await eventsDefault(athena, { limit: 50 });
```

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

## Partition Projection + Views

Athena tables with partition projection `type=injected` require a static WHERE predicate on the partition column. Without it, queries fail at runtime with `CONSTRAINT_VIOLATION`.

`init` and `add` inspect each selected table's Glue `Parameters` for projection settings and scaffold the SQL with:

- `-- @param <col> string` annotations
- `WHERE <col> = '{{<col>}}'` predicates
- `REPLACE_ME` placeholder values in `src/main.ts` plus a note at the top

When the target is a Presto/Trino view (detected via `TableType === 'VIRTUAL_VIEW'` or the `presto_view` / `trino_view` parameter flag), aathena decodes the view's `ViewOriginalText`, extracts `FROM` / `JOIN` table references, and probes those underlying tables recursively. Max traversal depth is 3 levels with a visited set to defuse cycles. If a view's references cannot be parsed or the probe hits the limit, a note is written into the scaffolded SQL so you know to add the predicates by hand.

Example output for a view over a partitioned table:

```sql
-- Starter aathena query. Edit or delete as needed.
-- See README for placeholder and parameter syntax.
-- View 'analytics.events' traced to: analytics.events_raw
-- @param tenant_id string

SELECT *
FROM events
WHERE tenant_id = '{{tenant_id}}'
LIMIT {{limit}}
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

## Cross-Database Queries

By default every query runs against `config.database`. When a SQL file lives in `tables/{other-db}/...` (different from `config.database`), `generate` automatically emits an explicit per-query binding so it routes to that database at runtime:

```typescript
// generated/queries/sales/events/default.ts (config.database is 'marketing')
export const default_ = createQuery<Events, DefaultParams>(
  'tables/sales/events/default.sql',
  schemaDef,
  { database: 'sales' },
);
```

You don't write this yourself - `add <db>.<table>` and `generate` handle it. For ad-hoc inline queries use `client.query(sql, { database: 'sales' })`.

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
    └── main.ts                # runnable example, written by 'init'
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
  const result = await eventsDefault(athena, { status: 'active', limit: 99 });
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
