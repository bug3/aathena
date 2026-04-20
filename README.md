# aathena

[![CI](https://github.com/bug3/aathena/actions/workflows/ci.yml/badge.svg)](https://github.com/bug3/aathena/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/aathena)](https://www.npmjs.com/package/aathena)
[![license](https://img.shields.io/npm/l/aathena)](LICENSE)
[![node](https://img.shields.io/node/v/aathena)](package.json)

Type-safe AWS Athena client for TypeScript.

- Scaffold a project straight from your AWS account with `npx aathena init`
- 1:1 type mapping from AWS Glue to TypeScript, including native Parquet/ORC arrays, maps, and structs - no `CAST()` or `JSON.parse`
- Run queries concurrently with `parallel()`, with automatic detection of injected-projection partitions (including those hidden behind Presto/Trino views)

Built on [@aws-sdk/client-athena](https://www.npmjs.com/package/@aws-sdk/client-athena) and [sql-render](https://github.com/bug3/sql-render). See the [`examples/`](examples/) directory for working projects.

## Quick Start

### 1. Install

```bash
npm install aathena
```

### 2. Initialize

```bash
npx aathena init
```

`init` walks you through a complete setup: picks an AWS region, picks a Glue database, lets you multi-select tables, probes each for partition requirements (following Presto/Trino views to their underlying tables), auto-runs `generate`, and writes a runnable `src/main.ts` that imports and invokes every scaffolded query. See [CLI Reference](#cli-reference) for the full sequence and flags.

### 3. Run it

```bash
npx tsx src/main.ts
```

If any scaffolded query needs partition values, `main.ts` passes `REPLACE_ME` placeholders with a note at the top of the file. Replace them with real values, then run.

Every row is typed 1:1 against your Glue schema. Scalars land as native TypeScript (`Date` for timestamps, `bigint`, `number`, `string`), and Parquet/ORC arrays, maps, and structs parse back recursively - even nested. Hover any field in your editor to see the exact column type, with no `CAST()` in SQL and no manual `JSON.parse`:

```typescript
// Glue: event_id bigint, created_at timestamp, tags array<varchar>, metadata map<string,int>, address struct<city:string>, items array<struct<qty:int>>

const result = await getEvents(athena, { rowLimit: 33 });
const row = result.rows[0];

row.eventId;         // bigint
row.createdAt;       // Date
row.tags;            // string[]
row.metadata;        // Record<string, number>
row.address.city;    // string - direct struct field access
row.items[0].qty;    // number - nested array of struct
```

## Write Queries

Your scaffolded queries live under `tables/{database}/{table}/{query-name}.sql`. Open the file `init` (or `add`) created and shape it to your needs. Placeholders use `{{name}}` syntax. Types are inferred from SQL context:

```sql
WHERE status = '{{status}}'    -- quoted       -> string
LIMIT {{rowLimit}}             -- LIMIT/OFFSET -> positiveInt
WHERE price >= {{minPrice}}    -- comparison   -> number
```

For stricter validation, annotate with `-- @param`:

```sql
-- @param status enum('active','pending','done')
-- @param rowLimit positiveInt
-- @param startDate isoDate
SELECT *
FROM events
WHERE status = '{{status}}'
  AND created_at >= '{{startDate}}'
LIMIT {{rowLimit}}
```

Generates:

```typescript
interface DefaultParams {
  status: 'active' | 'pending' | 'done';
  rowLimit: number;               // validated > 0
  startDate: string;              // validated YYYY-MM-DD
}
```

See [`@param` types](#param-types) in Reference for the full annotation list.

## Run Queries

Every generated query accepts a client and its typed parameters:

```typescript
import { createClient } from 'aathena';
import { eventsDefault } from './generated';

const athena = createClient();
const result = await eventsDefault(athena, { status: 'active', rowLimit: 99 });
```

`createClient()` reads `aathena.config.json` automatically; pass an explicit config to override (`createClient({ region: 'us-east-1', database: 'analytics' })`) - useful in tests or when the project root isn't on disk.

`client.query()` retries `StartQueryExecution` with exponential backoff + full jitter when Athena responds with `TooManyRequestsException / CONCURRENT_QUERY_LIMIT_EXCEEDED`. Up to 6 attempts. Applies to every call, generated or inline, including tasks dispatched by `parallel()`.

### `parallel()`

`parallel()` runs multiple queries concurrently with a bounded cap that respects Athena's per-account active-DML quota. Tasks are passed as thunks (`() => query(...)`) so the helper can gate when each query actually starts.

```typescript
import { createClient, parallel } from 'aathena';
import { getUsers, getOrders } from './generated';

const athena = createClient();

const [users, orders] = await parallel(
  [
    () => getUsers(athena, { rowLimit: 99 }),
    () => getOrders(athena, { from: '2022-02-02' }),
  ],
  { concurrency: 'auto', client: athena },
);
```

#### Concurrency resolution

`concurrency` accepts a number or `'auto'`. With `'auto'`, the cap is resolved in this order:

1. `AathenaConfig.maxConcurrency` if set
2. Live AWS Service Quotas lookup (`L-D405C694` DML, `L-FCDFE414` DDL)
3. Region-aware conservative fallback (50% of AWS-documented default, clamped to `[5, 25]`)

The live lookup uses `@aws-sdk/client-service-quotas`, an optional dependency loaded via dynamic import. It requires the `servicequotas:GetServiceQuota` IAM permission; without it the lookup fails silently and the fallback is used.

#### Options

| Option | Default | Description |
|---|---|---|
| `concurrency` | `5` | `number` or `'auto'` |
| `client` | - | Required when `concurrency: 'auto'` and `maxConcurrency` is unset |
| `kind` | `'dml'` | `'dml'` or `'ddl'`, selects which quota to probe |
| `reserveHeadroom` | `1` | Subtracted from the resolved quota |
| `mode` | `'all'` | `'all'` rejects on first failure; `'allSettled'` returns per-task settlements |

### Error handling

```typescript
import {
  AathenaError,
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
  ColumnParseError,
} from 'aathena';

try {
  const result = await eventsDefault(athena, { status: 'active', rowLimit: 99 });
} catch (err) {
  if (err instanceof QueryTimeoutError) {
    console.log(`Timed out after ${err.timeoutMs}ms: ${err.queryExecutionId}`);
  } else if (err instanceof QueryFailedError) {
    console.log(`Athena error: ${err.athenaErrorMessage}`);
  } else if (err instanceof AathenaError) {
    // QueryCancelledError, ColumnParseError, or anything else aathena threw
    console.log(`aathena error (${err.name}): ${err.message}`);
  } else {
    throw err;
  }
}
```

All four specific classes extend `AathenaError`, so catching the base is enough when you don't need to discriminate.

## Advanced

### Partition projection and views

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
LIMIT {{rowLimit}}
```

### Cross-database queries

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

### Query statistics

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

## CLI Reference

| Command | Purpose |
|---|---|
| `aathena init` | Interactive project scaffold. Fills config from AWS, picks tables, probes partitions, runs generate, writes `src/main.ts`. |
| `aathena add <table>` | Scaffold a new query under `tables/{database}/{table}/<name>.sql`. Accepts `db.table` for cross-database tables and prompts to resolve mismatches. |
| `aathena generate` | Re-run codegen (fetch Glue schemas, produce typed query functions). Runs automatically after `init` and `add` unless `--no-generate`. |
| `aathena help` | Show all flags. |

### `aathena init`

Runs interactively by default, then:

1. Resolves the AWS region from `--region`, the `AWS_REGION` / `AWS_DEFAULT_REGION` env vars, or a select prompt (common commercial regions plus a Custom fallback for typing one in); lists Glue databases and Athena workgroups; inherits the workgroup's default output location when available
2. Writes `aathena.config.json` and adds `node_modules/` to `.gitignore` (the `generated/` directory is committed by default; delete it or add it to `.gitignore` yourself if you prefer to regenerate on every build)
3. Lets you multi-select which tables to scaffold starter SQL for
4. Probes each selected table (and any Presto/Trino view it points at) for injected-projection partitions that require WHERE predicates
5. Writes `tables/{db}/{table}/default.sql` with `LIMIT {{rowLimit}}`, plus the right `-- @param` / `WHERE` lines
6. Runs `generate` to produce typed query functions under `generated/`
7. Writes a runnable `src/main.ts` that imports and calls every scaffolded query (single call for 1 table, `parallel()` demo for 2+)

Flags:

- `--region`, `--database`, `--workgroup`, `--output-location`, `--tables a,b,c` - non-interactive overrides
- `--tables-dir <path>` - override the SQL scaffold root (default `tables`); persisted to `config.tablesDir`
- `--out-dir <path>` - override the codegen output directory (default `generated`); persisted to `config.outDir`
- `--example-path <path>` - override the runnable starter file (default `src/main.ts`); the `from '../generated'` import is rewritten to point at `--out-dir` from the chosen location
- `--no-sample` - skip SQL scaffolding
- `--no-generate` - skip the auto-generate step
- `--no-example` - skip writing the example file
- `--force` - overwrite `aathena.config.json` and regenerate the example file to reflect the current selection. SQL files are always preserved because you may have edited them.

### `aathena add`

```bash
npx aathena add events                  # tables/{config.db}/events/default.sql
npx aathena add sales.events            # cross-db; interactive prompt resolves mismatch
npx aathena add events --from-schema    # embed Glue column list as a comment block
npx aathena add events --name daily     # scaffold daily.sql instead of default.sql
```

`add` always probes partitions (even without `--from-schema`) and auto-runs `generate` unless `--no-generate`.

Flags:

- `--name <query-name>` - query filename (default: `default`)
- `--from-schema` - include Glue column list as a comment block
- `--force` - overwrite an existing SQL file
- `--no-generate` - skip the auto-generate step

### `aathena generate`

Re-runs codegen: fetches Glue schemas for every SQL file under `tables/` in parallel and produces `generated/types/{database}/{table}.ts`, `generated/queries/{database}/{table}/{query}.ts`, and a barrel `generated/index.ts`. Run it after editing SQL files or when upstream schemas change. Surfaces a one-line info when a query directory's database differs from `config.database` and a per-query binding is emitted.

## Reference

### Configuration

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

### Type mapping

Glue column types map 1:1 to TypeScript:

| Athena | TypeScript |
|---|---|
| `varchar`, `string`, `char` | `string` |
| `integer`, `int`, `smallint`, `tinyint` | `number` |
| `bigint` | `bigint` |
| `double`, `float`, `real` | `number` |
| `decimal` | `string` (preserves precision) |
| `boolean` | `boolean` |
| `date` | `string` (`YYYY-MM-DD`) |
| `timestamp` | `Date` |
| `json` | `unknown` |
| `binary`, `varbinary` | `string` (Base64 encoded) |
| `array<T>` | `T[]` |
| `map<K, V>` | `Record<K, V>` |
| `struct<a:T, b:U>` | `{ a: T; b: U }` |

Regular columns are nullable (`T | null`); partition keys are always non-null. See [Quick Start step 3](#3-run-it) for a typed-access demo that covers scalars and nested complex types.

### `@param` types

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
const result = await eventsDefault(athena, { rowLimit: 33 });
```

### Directory structure

```
project/
├── aathena.config.json        # project root marker, written by 'init'
├── tables/                    # SQL files you edit
│   └── sampledb/              # database
│       └── events/            # table
│           ├── default.sql
│           └── daily.sql
├── generated/                 # codegen output, committed by default
│   ├── index.ts               # barrel re-exporting every query under a JS-safe name
│   ├── types/                 # one file per table, mirroring the Glue schema
│   │   └── sampledb/
│   │       └── events.ts
│   └── queries/               # one file per SQL, binding it to its types
│       └── sampledb/
│           └── events/
│               ├── default.ts
│               └── daily.ts
└── src/
    └── main.ts                # runnable example, written by 'init'
```

Nested grouping under a table (e.g. `events/cart/add.sql`) works too - codegen walks the whole tree under `tables/`.

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
