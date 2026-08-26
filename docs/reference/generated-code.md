# Generated code

Codegen writes three things: one type file per table, one query file per SQL
file, and a barrel that re-exports everything.

## Export names

The barrel at `generated/index.ts` re-exports every query under a JS-safe
identifier:

| SQL file | Export |
| --- | --- |
| `latest.sql` | `latest` |
| `by-date-range.sql` | `byDateRange` |
| `default.sql`, a JS reserved word | aliased to `<table>Default`, e.g. `eventsDefault` |
| the same filename under two tables | aliased to `<table>{Query}` on both sides |

So a scaffolded `tables/sampledb/events/default.sql` is used as:

```typescript
import { eventsDefault } from './generated';
const result = await eventsDefault(athena, { rowLimit: 33 });
```

A real barrel, from the example project in this repository:

<<< @/../examples/basic/generated/index.ts

## Query files

Each SQL file becomes one function bound to its table's row type and its own
parameter interface:

<<< @/../examples/basic/generated/queries/sampledb/orders/detail.ts

The parameter interface name comes from the SQL file name, not from the
function name, so multi-word queries keep their word boundaries:
`by-date-range.sql` yields `byDateRange` and `ByDateRangeParams`.

## Cross-database queries

When a query directory's database differs from `config.database`, codegen
emits an explicit binding as the third argument so the runtime routes it
correctly:

```typescript
export const default_ = createQuery<Events, DefaultParams>(
  'tables/sales/events/default.sql',
  schemaDef,
  { database: 'sales' },
);
```

You do not write this yourself: `aathena add <db>.<table>` and `generate`
handle it. For ad-hoc inline queries, use
`client.query(sql, { database: 'sales' })`.

## Committing generated output

`init` leaves `generated/` committed by default, and the examples in this
repository do the same. Delete it or add it to `.gitignore` if you would
rather regenerate on every build.
