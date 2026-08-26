---
description: "Every field of aathena.config.json, its default, and how to override the config at runtime."
---

# Configuration

`aathena.config.json` lives at your project root and marks it. `init` writes
it; edit it afterwards as needed. Both the CLI and the runtime find it by
walking up the directory tree, so it works from any subdirectory.

```json
{
  "region": "eu-west-1",
  "database": "sampledb",
  "workgroup": "primary",
  "outputLocation": "s3://my-bucket/athena-results/",
  "tablesDir": "./tables",
  "outDir": "./generated",
  "codegen": {
    "indent": 2
  },
  "query": {
    "timeout": 300000,
    "pollingInterval": 500,
    "maxPollingInterval": 5000
  }
}
```

## The type

This is the actual declaration, included from `src/runtime/types.ts`:

<<< @/../src/runtime/types.ts#config

## Fields

| Field | Default | Meaning |
| --- | --- | --- |
| `region` | the AWS default chain | AWS region |
| `database` | *required* | primary Athena database, used when a query's directory does not say otherwise |
| `workgroup` | - | Athena workgroup |
| `outputLocation` | - | S3 path for query results; optional when the workgroup has a default |
| `tablesDir` | `./tables` | where your SQL files live |
| `outDir` | `./generated` | where codegen writes |
| `codegen.indent` | `2` | spaces used to indent generated files, clamped to `[1, 8]` |
| `query.timeout` | `300000` | query timeout in ms, 5 minutes |
| `query.pollingInterval` | `500` | initial poll interval in ms |
| `query.maxPollingInterval` | `5000` | maximum poll interval in ms |
| `maxConcurrency` | - | overrides `parallel({ concurrency: 'auto' })` when Service Quotas is unreachable |

## Overriding at runtime

`createClient()` reads the file. Passing a config skips it entirely, which is
what you want in tests or when the project root is not on disk:

<<< @/snippets/explicit-config.ts
