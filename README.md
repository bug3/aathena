# aathena

Type-safe AWS Athena client for TypeScript. Write SQL, run codegen, get fully typed query functions.

- Write SQL files with `{{variable}}` placeholders - same syntax you'd use in the Athena console
- Run `npx aathena generate` - types and query functions are created automatically
- Import and call - input parameters and query results are fully typed

Built on [@aws-sdk/client-athena](https://www.npmjs.com/package/@aws-sdk/client-athena) and [sql-render](https://github.com/bug3/sql-render).

## Installation

```bash
npm install aathena
```

## How It Works

```
 You write SQL          Codegen generates          You use in code
┌──────────────┐      ┌─────────────────────┐      ┌──────────────────┐
│ tables/       │      │ generated/           │      │ src/             │
│  sampledb/        │ ───> │  types/events.ts     │ ───> │  import { product } │
│   events/     │      │  queries/product.ts  │      │  from './generated' │
│    product.sql│      │                     │      │                  │
└──────────────┘      └─────────────────────┘      └──────────────────┘
                  npx aathena generate
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

### 2. Write your SQL

Create a SQL file under `tables/{database}/{table}/{query}.sql`:

```sql
-- tables/sampledb/events/product.sql
SELECT event_id, event_name, price, created_at
FROM events
WHERE status = '{{status}}'
LIMIT {{limit}}
```

That's it. Same SQL you'd write in the Athena console, with `{{variables}}` for dynamic values.

### 3. Generate

```bash
npx aathena generate
```

This does two things:

1. Fetches your table schema from AWS Glue Data Catalog and generates TypeScript interfaces
2. Scans your SQL files and generates typed query functions with parameter types inferred from context

Output:

```
generated/
├── types/
│   └── sampledb/
│       └── events.ts        # interface Events { event_id: number; ... }
└── queries/
    └── sampledb/
        └── events/
            └── product.ts   # export const product = createQuery<Events, ProductParams>(...)
```

### 4. Use

```typescript
import { createClient } from 'aathena';
import { product } from './generated/queries/sampledb/events/product';

const athena = createClient({
  database: 'sampledb',
  outputLocation: 's3://my-bucket/athena-results/',
});

const result = await product(athena, { status: 'active', limit: 100 });

result.rows[0].event_id    // number
result.rows[0].event_name  // string
result.rows[0].price       // string (decimal - precision safe)
result.rows[0].created_at  // Date
```

No manual type definitions. No mapping. Just SQL in, typed results out.

## Directory Structure

```
project/
├── tables/                     # You write SQL here
│   ├── sampledb/               # Database name
│   │   ├── events/             # Table name
│   │   │   ├── product.sql
│   │   │   ├── category.sql
│   │   │   └── cart/
│   │   │       ├── add.sql     # Nested grouping is fine
│   │   │       └── remove.sql
│   │   └── users/
│   │       └── active.sql
│   └── analytics/              # Multiple databases supported
│       └── sessions/
│           └── recent.sql
├── generated/                  # Codegen output (git-ignored)
│   ├── types/
│   ├── queries/
│   └── index.ts
├── aathena.config.json
└── src/                        # Your application code
```

The convention is simple: `tables/{database}/{table}/{query}.sql`. Codegen mirrors this structure in `generated/queries/`.

## Parameter Type Inference

aathena automatically infers parameter types from SQL context:

```sql
WHERE status = '{{status}}'         -- quoted → string
LIMIT {{limit}}                     -- LIMIT/OFFSET → number
WHERE price >= {{minPrice}}         -- unquoted comparison → number
```

Generated params interface:

```typescript
export interface ProductParams {
  status: string;
  limit: number;
  minPrice: number;
}
```

### Explicit Types with `@param`

For stricter types, add `@param` annotations as SQL comments:

```sql
-- @param status enum('active','pending','done')
-- @param limit positiveInt
-- @param startDate isoDate
SELECT event_id, event_name
FROM events
WHERE status = '{{status}}'
  AND created_at >= '{{startDate}}'
LIMIT {{limit}}
```

This generates narrower TypeScript types **and** adds runtime validation:

```typescript
export interface ProductParams {
  status: 'active' | 'pending' | 'done';  // union type
  limit: number;                            // validated as positive integer
  startDate: string;                        // validated as YYYY-MM-DD
}
```

Available `@param` types:

| Annotation | TypeScript Type | Validation |
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

When no `@param` is provided, types are inferred from context automatically. Both approaches can be mixed in the same file.

## Type Mapping

Table types are generated from AWS Glue Data Catalog. Athena column types map to TypeScript as follows:

| Athena | TypeScript | Notes |
|---|---|---|
| `varchar`, `string`, `char` | `string` | |
| `integer`, `int`, `smallint`, `tinyint` | `number` | |
| `bigint` | `number` | |
| `double`, `float`, `real` | `number` | |
| `decimal` | `string` | String to preserve precision |
| `boolean` | `boolean` | |
| `date` | `string` | `YYYY-MM-DD` format |
| `timestamp` | `Date` | |
| `json` | `unknown` | |
| `array<T>` | `T[]` | Recursive |
| `map<K, V>` | `Record<K, V>` | Recursive |
| `struct<a:T, b:U>` | `{ a: T; b: U }` | Recursive |

## Config

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
| `workgroup` | `undefined` | Athena workgroup |
| `outputLocation` | *required* | S3 path for query results |
| `tablesDir` | `./tables` | Directory containing SQL files |
| `outDir` | `./generated` | Codegen output directory |
| `query.timeout` | `300000` | Query timeout in ms (5 min) |
| `query.pollingInterval` | `500` | Initial polling interval in ms |
| `query.maxPollingInterval` | `5000` | Max polling interval in ms |

## Query Execution

Under the hood, each generated query function handles the full Athena lifecycle:

1. Renders the SQL template with your parameters (using [sql-render](https://github.com/bug3/sql-render) for injection protection)
2. Calls `StartQueryExecution`
3. Polls `GetQueryExecution` with exponential backoff until complete
4. Fetches results via `GetQueryResults` with automatic pagination
5. Parses every `VarCharValue` string into the correct TypeScript type using column metadata

```typescript
const result = await product(athena, { status: 'active', limit: 100 });

result.rows              // Events[] - typed rows
result.queryExecutionId  // string - for debugging
result.statistics        // { dataScannedInBytes, engineExecutionTimeInMillis }
```

## Error Handling

```typescript
import {
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
  ColumnParseError,
} from 'aathena';

try {
  const result = await product(athena, { status: 'active', limit: 100 });
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

- [sql-render](https://github.com/bug3/sql-render) - Type-safe SQL templating with injection protection. Used internally by aathena for parameter rendering.

## License

[MIT](LICENSE)
