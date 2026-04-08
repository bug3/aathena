# Roadmap

## v0.2

- [ ] **Watch mode for codegen** - `aathena generate --watch` to automatically regenerate types and query functions when SQL files change, removing the need to manually re-run codegen during development
- [ ] **Dry run / cost estimation** - Run `EXPLAIN` before executing a query to show estimated bytes to scan. Athena charges per byte, so knowing the cost upfront is valuable
- [ ] **Stale type detection** - `aathena check` command that compares generated types against current Glue schemas and warns if they are out of sync

## Maybe

- [ ] **Query result reuse** - Expose Athena's built-in result reuse via config. When the same query runs again within a time window, Athena reads from S3 cache instead of scanning, reducing cost to zero
- [ ] **Inline SQL support** - Allow passing SQL strings directly without requiring a `.sql` file, reducing boilerplate for short one-off queries
- [ ] **CTAS / UNLOAD support** - Write query results to S3 as Parquet or ORC. Commonly needed in ETL pipelines where the output feeds into downstream tables
