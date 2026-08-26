---
description: "The statistics block on every QueryResult: timings, bytes scanned, cache hits, and opt-in runtime row counts."
---

# Query statistics

Every `QueryResult` carries a `statistics` block taken from Athena's
`GetQueryExecution`. It is the cheapest way to see what a query cost, how long
it waited, and whether it was served from cache.

```typescript
const result = await athena.query<Row>(sql, { includeRuntimeStats: true });

result.statistics.totalExecutionTimeInMillis;   // 8128
result.statistics.resultReused;                 // true
result.statistics.runtime?.outputRows;          // 99
```

## The type

Included from `src/runtime/types.ts`:

<<< @/../src/runtime/types.ts#statistics

| Field | Meaning |
| --- | --- |
| `engineExecutionTimeInMillis` | engine execution time |
| `totalExecutionTimeInMillis` | wall time Athena took |
| `queryQueueTimeInMillis` | time spent waiting in the queue |
| `queryPlanningTimeInMillis` | planning and partition retrieval |
| `servicePreProcessingTimeInMillis` | preprocessing before the engine ran |
| `serviceProcessingTimeInMillis` | result publication |
| `dataScannedInBytes` | what drives the bill |
| `dpuCount` | capacity-reservation workgroups only |
| `resultReused` | true when Athena served the result from its cache |
| `runtime` | input/output row and byte counts, opt-in |

## Runtime statistics are opt-in

`runtime` stays undefined unless you pass `{ includeRuntimeStats: true }`,
because populating it costs an extra `GetQueryRuntimeStatistics` API call.
Ask for it when you are measuring; leave it off in hot paths.
