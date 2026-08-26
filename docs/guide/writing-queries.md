# Writing queries

Queries stay SQL. A file under `tables/{database}/{table}/{name}.sql` becomes
one exported function, and its parameters are typed from the SQL itself.

Placeholders use <code v-pre>{{name}}</code> syntax.

## Inferred parameter types

If you write nothing else, the type is inferred from the surrounding SQL:

```sql
WHERE status = '{{status}}'    -- quoted           -> string
LIMIT {{rowLimit}}             -- LIMIT / OFFSET   -> positiveInt
WHERE price >= {{minPrice}}    -- comparison       -> number
```

Anything the parser cannot place falls back to `string`.

The placeholder name is free. Scaffolded SQL uses <code v-pre>{{rowLimit}}</code>
and <code v-pre>{{skip}}</code> rather than <code v-pre>{{limit}}</code> and
<code v-pre>{{offset}}</code>, because SQL formatters
otherwise mistake the placeholder for the keyword it follows.

## Declared parameter types

`-- @param` annotations take priority over inference and add runtime
validation, which runs before the query is submitted rather than after Athena
has billed for the scan:

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

That generates:

```typescript
export interface DefaultParams {
  status: 'active' | 'pending' | 'done';
  rowLimit: number;               // validated > 0
  startDate: string;              // validated YYYY-MM-DD
}
```

### Available annotations

| Annotation | Accepts |
| --- | --- |
| `string` | any string, with a SQL injection check |
| `number` | a finite number |
| `boolean` | `true` / `false` |
| `positiveInt` | an integer greater than zero |
| `isoDate` | `YYYY-MM-DD` |
| `isoTimestamp` | ISO 8601 |
| `identifier` | a SQL identifier |
| `uuid` | an RFC 4122 UUID |
| `s3Path` | `s3://bucket/path` |
| `enum('a','b','c')` | one of the listed values, and the generated type is the union |

## A worked example

The example project in this repository has a query with an inferred parameter
and a partition predicate:

<<< @/../examples/basic/tables/sampledb/orders/detail.sql{sql}

Codegen turns it into this, with `schema.string` and `schema.positiveInt`
enforcing the annotations at call time:

<<< @/../examples/basic/generated/queries/sampledb/orders/detail.ts

## Where files live

```
project/
├── aathena.config.json        # project root marker, written by `init`
├── tables/                    # the SQL you edit
│   └── sampledb/              # database
│       └── events/            # table
│           ├── default.sql
│           └── daily.sql
├── generated/                 # codegen output, committed by default
│   ├── index.ts               # barrel, re-exports every query
│   ├── types/                 # one file per table, mirroring Glue
│   └── queries/               # one file per SQL file
└── src/
    └── main.ts                # runnable example, written by `init`
```

Nested grouping under a table works too: `events/cart/add.sql` is fine, since
codegen walks the whole tree under `tables/`.

## Next

- [Running queries](./running-queries.md) - calling what you just generated
