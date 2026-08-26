---
description: "How aathena probes Athena partition projection and traces Presto/Trino views so scaffolded SQL carries the required WHERE predicates."
---

# Partitions and views

Athena tables using partition projection with `type=injected` will not answer
a query unless every injected column appears in the `WHERE` clause with a
static value. Miss one and the query fails, which is a poor thing to discover
in production.

`init` and `add` probe for this before they scaffold, so the SQL they write
already satisfies the requirement.

## What the probe looks for

It reads the table's Glue `Table.Parameters` and treats a column as required
when both hold:

- `projection.enabled` is `'true'`
- `projection.<column>.type` is `'injected'`

Other projection types - `enum`, `integer`, `date` - are not required in the
`WHERE` clause and are left alone.

For every column that qualifies, the scaffolded SQL gets:

- a `-- @param <column> string` annotation
- a <code v-pre>WHERE &lt;column&gt; = '{{&lt;column&gt;}}'</code> predicate
- a `REPLACE_ME` placeholder in the generated `src/main.ts`, with a note at
  the top of the file

That is why a freshly scaffolded project sometimes has `REPLACE_ME` in it:
the values are yours to fill in, and the query will not run until you do.

## Presto and Trino views

A view has no partitions of its own, so probing it directly tells you nothing.
aathena detects one when Glue reports `TableType === 'VIRTUAL_VIEW'`, or when
the `presto_view` or `trino_view` parameter is `'true'`.

For a view it decodes `ViewOriginalText`, extracts the tables referenced in
`FROM` and `JOIN` clauses, and probes those recursively. The union of every
required partition found underneath is what ends up in your SQL.

Recursion is bounded: it stops at a depth of 3 and carries a visited set, so a
view referencing itself through two others terminates rather than spinning.

## When the probe cannot be sure

Probe notes are written into the scaffolded SQL as comments - which view was
traced, which reference failed to parse, whether the depth limit was hit.
They are there so you can see why a given predicate was added, and so a
missing one is visible rather than silent.

If you see `View depth limit exceeded`, add the remaining `WHERE` predicates
by hand.
