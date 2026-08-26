---
layout: home
description: "Type-safe Amazon Athena client and AWS Glue code generator for TypeScript. Generate a typed query function from every SQL file."

hero:
  name: aathena
  text: Type-safe Athena for TypeScript
  tagline: Generate typed query functions from your AWS Glue catalog, then call them like ordinary functions.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Reference
      link: /reference/configuration
    - theme: alt
      text: View on GitHub
      link: https://github.com/bug3/aathena

features:
  - title: Types come from the catalog
    details: Column names and types are read from AWS Glue and emitted verbatim, so a row object matches the table it came from - no hand-written interfaces to drift.
  - title: Queries stay SQL
    details: Write ordinary SQL with typed placeholders. Parameters are validated before the query is submitted, not after Athena has billed for the scan.
  - title: One generated function per query
    details: Each .sql file becomes an exported function with a typed parameter object and a typed result, discoverable through autocomplete.
---
