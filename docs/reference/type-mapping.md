# Type mapping

Glue column types map 1:1 to TypeScript. Column names are emitted verbatim -
`event_id` stays `event_id`, not `eventId` - so a row object matches the table
it came from.

| Athena | TypeScript |
| --- | --- |
| `varchar`, `string`, `char` | `string` |
| `integer`, `int`, `smallint`, `tinyint` | `number` |
| `bigint` | `bigint` |
| `double`, `float`, `real` | `number` |
| `decimal` | `string`, to preserve precision |
| `boolean` | `boolean` |
| `date` | `string`, `YYYY-MM-DD` |
| `timestamp` | `Date` |
| `json` | `unknown` |
| `binary`, `varbinary` | `string`, Base64 encoded |
| `array<T>` | `T[]` |
| `map<K, V>` | `Record<K, V>` |
| `struct<a:T, b:U>` | `{ a: T; b: U }` |

Anything unrecognised falls back to `string`.

## Nullability

Athena guarantees `NOT NULL` only for partition keys. Every other column is
typed `T | null`, and that is not a conservatism you can opt out of - it is
what the catalog reports.

In practice this is the rule that shapes your access patterns:

```typescript
row.address?.city;    // string | undefined
row.items?.[0].qty;   // number | undefined
row.dt;               // string - a partition key, so no guard needed
```

## Complex types stay native

At the SDK level Athena returns every value as a flat string, even when the
underlying Parquet or ORC column is a real array, map or struct. aathena
parses them back recursively, so your code sees the shapes the source data
uses: no `CAST()` in SQL, no extra views, no manual `JSON.parse`. Nested
combinations like `array<map<string, struct<...>>>` work the same way.

Here is a generated type covering the whole table above, from the example
project in this repository:

<<< @/../examples/basic/generated/types/sampledb/orders.ts
