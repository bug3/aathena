# aathena

[![CI](https://github.com/bug3/aathena/actions/workflows/ci.yml/badge.svg)](https://github.com/bug3/aathena/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/aathena)](https://www.npmjs.com/package/aathena)
[![license](https://img.shields.io/npm/l/aathena)](LICENSE)
[![node](https://img.shields.io/node/v/aathena)](package.json)

Type-safe AWS Athena client for TypeScript. Write SQL, run codegen, get fully typed query functions.

- Write SQL files with `{{variable}}` placeholders
- Run `npx aathena generate` to create types and query functions from AWS Glue schemas
- Import and call with full type safety on both parameters and results

Built on [@aws-sdk/client-athena](https://www.npmjs.com/package/@aws-sdk/client-athena) and [sql-render](https://github.com/bug3/sql-render). See the [`examples/`](examples/) directory for a working project structure.

## Installation

```bash
npm install aathena
```

## Quick Start

### 1. Create config

```json
// aathena.config.json
{
  "database": "sampledb",
  "workgroup": "primary",
  "outputLocation": "s3://my-bucket/athena-results/"
}
```

### 2. Write SQL

Create a file under `tables/{database}/{table}/{query}.sql`:

```sql
-- tables/sampledb/events/product.sql
SELECT event_id, event_name, price, created_at
FROM events
WHERE status = '{{status}}'
LIMIT {{limit}}
```

### 3. Generate

```bash
npx aathena generate
```

Codegen fetches your table schema from AWS Glue and generates typed query functions:

```
generated/
├── types/sampledb/
│   └── events.ts          # interface Events { event_id: number; ... }
├── queries/sampledb/events/
│   └── product.ts         # export const product = createQuery<Events, ProductParams>(...)
└── index.ts               # barrel exports
```

### 4. Use

```typescript
import { createClient } from 'aathena';
import { product } from './generated';

const athena = createClient(); // reads from aathena.config.json

const result = await product(athena, { status: 'active', limit: 99 });

result.rows[0].event_id    // number
result.rows[0].event_name  // string
result.rows[0].price       // string (decimal - precision safe)
result.rows[0].created_at  // Date
```

You can also pass config explicitly: `createClient({ database: 'mydb', outputLocation: 's3://...' })`.

## Directory Structure

```
project/
├── aathena.config.json         # project root marker (required)
├── tables/                     # SQL files go here
│   └── sampledb/               # database name
│       ├── events/             # table name
│       │   ├── product.sql
│       │   └── category.sql
│       └── users/
│           └── active.sql
├── generated/                  # codegen output (gitignored)
└── src/
```

`aathena.config.json` must be at the project root. Both the CLI and runtime use it to locate SQL files, so queries work regardless of the working directory.

Convention: `tables/{database}/{table}/{query}.sql`. Nested grouping (e.g. `events/cart/add.sql`) is supported.

## Parameter Type Inference

Parameter types are inferred automatically from SQL context:

```sql
WHERE status = '{{status}}'      -- quoted       → string
LIMIT {{limit}}                  -- LIMIT/OFFSET → number
WHERE price >= {{minPrice}}      -- comparison   → number
```

### Explicit Types with `@param`

For stricter validation, add `@param` annotations:

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

Generates narrower types with runtime validation:

```typescript
interface ProductParams {
  status: 'active' | 'pending' | 'done';  // union type
  limit: number;                           // validated > 0
  startDate: string;                       // validated YYYY-MM-DD
}
```

### Available `@param` Types

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

Inference and annotations can be mixed in the same file. Annotations take priority.

## Type Mapping

Table types are generated from the AWS Glue Data Catalog:

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

### Complex Types

Athena's complex types (`array`, `map`, `struct`) are fully supported, both in generated TypeScript types and at runtime parsing. Nested combinations like `array<map<string, struct<...>>>` work recursively.

This is a common pain point with Athena: the AWS SDK returns every value as a flat string, leaving you to manually parse complex types. Without aathena, you're stuck with workarounds: writing `CAST()` expressions in SQL, creating extra views, or manually calling `JSON.parse()` and hoping the shape is right. aathena handles this automatically, your Parquet/ORC native types map 1:1 to TypeScript, no conversion needed.

```typescript
// Glue schema: tags array<varchar>, metadata map<string,integer>, address struct<city:string,zip:integer>

result.rows[0].tags      // string[]
result.rows[0].metadata  // Record<string, number>
result.rows[0].address   // { city: string; zip: number }
result.rows[0].address.city  // string, direct access just like the source data
```

## Config

Place `aathena.config.json` at the root of your project. The CLI and runtime will walk up the directory tree to find it automatically.

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
| `database` | *required* | Default Athena database |
| `workgroup` | - | Athena workgroup |
| `outputLocation` | - | S3 path for query results (optional if workgroup has a default) |
| `tablesDir` | `./tables` | SQL files directory |
| `outDir` | `./generated` | Codegen output directory |
| `query.timeout` | `300000` | Query timeout in ms (5 min) |
| `query.pollingInterval` | `500` | Initial poll interval in ms |
| `query.maxPollingInterval` | `5000` | Max poll interval in ms |

## Query Statistics

Every `QueryResult` includes a `statistics` block from Athena (cost tracking, queueing visibility, cache hits). Pass `{ includeRuntimeStats: true }` to additionally fetch input/output row counts via an extra `GetQueryRuntimeStatistics` API call.

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

## Error Handling

```typescript
import {
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
  ColumnParseError,
} from 'aathena';

try {
  const result = await product(athena, { status: 'active', limit: 99 });
} catch (err) {
  if (err instanceof QueryTimeoutError) {
    console.log(`Timed out after ${err.timeoutMs}ms: ${err.queryExecutionId}`);
  }
  if (err instanceof QueryFailedError) {
    console.log(`Athena error: ${err.athenaErrorMessage}`);
  }
}
```

## Related

- [sql-render](https://github.com/bug3/sql-render) - Type-safe SQL templating with injection protection (used internally)

## For LLMs

Two machine-readable summaries are maintained for AI consumption, following the [llms.txt](https://llmstxt.org) convention:

- [llms.txt](llms.txt) - curated API reference and usage guide
- [llms-full.txt](llms-full.txt) - full packed source, auto-generated on each push

## License

[MIT](LICENSE)
