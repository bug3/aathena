import { isAbsolute, resolve } from 'node:path';
import type { QueryResult } from './types';
import { AathenaClient } from './client';
import { findProjectRoot } from './config';

// sql-render is used internally for template rendering
import { defineQuery as sqlRenderDefine, schema as sqlRenderSchema } from 'sql-render';

/** Per-call options forwarded to the SQL renderer. */
export interface RenderOptions {
  /**
   * Write the rendered SQL (with parameter values substituted) to this path
   * for debugging or auditing. Forwarded directly to sql-render, which
   * creates missing parent directories automatically. The query still
   * executes; the file is overwritten on each call.
   */
  exportTo?: string;
}

/**
 * The shape every generated query function has: a client, its typed
 * parameters, and optional per-call render options.
 */
type QueryFn<TResult, TParams> = (
  client: AathenaClient,
  params: TParams,
  options?: RenderOptions,
) => Promise<QueryResult<TResult>>;

/** Options bound once, when the query function is created. */
export interface CreateQueryOptions {
  /**
   * Execution context database for this query. Takes precedence over
   * AathenaConfig.database. Emitted by codegen when the query's directory
   * database differs from the project's primary database.
   */
  database?: string;
}

/**
 * Binds a SQL template to its result and parameter types, returning the
 * function you call.
 *
 * You do not normally write this. `aathena add` scaffolds the SQL and
 * `aathena generate` emits one `createQuery` call per file, with the types
 * read from your Glue catalog. Import the generated function instead:
 *
 * ```typescript
 * import { createClient } from 'aathena';
 * import { byStatus } from './generated';
 *
 * const athena = createClient();
 * const result = await byStatus(athena, { status: 'active', rowLimit: 99 });
 * ```
 *
 * Hand-writing it is supported for queries that live outside the `tables/`
 * tree, but then the types are yours to keep correct:
 *
 * ```typescript
 * import { createQuery, schema } from 'aathena/runtime';
 *
 * const recent = createQuery<{ id: bigint | null }, { rowLimit: number }>(
 *   'sql/recent.sql',
 *   { rowLimit: schema.positiveInt },
 * );
 * ```
 *
 * @param sqlPath Path to the `.sql` file. Relative paths resolve from the
 *   project root, found by walking up to `aathena.config.json`; absolute
 *   paths skip that lookup.
 * @param schemaDef Validators per parameter, checked before the query is
 *   submitted rather than after Athena has billed for the scan.
 * @param options Binds the execution database when it differs from the
 *   project's primary one.
 */
export function createQuery<TResult, TParams = Record<string, never>>(
  sqlPath: string,
  schemaDef?: Record<string, { validate(val: unknown): boolean }>,
  options: CreateQueryOptions = {},
): QueryFn<TResult, TParams> {
  // Defer project-root lookup and template load until the first call, so
  // importing a generated query doesn't trigger filesystem I/O at module
  // load time (important for bundled Lambda deploys and test isolation).
  type RenderFn = (values: never, opts?: RenderOptions) => { sql: string };
  let renderFn: RenderFn | null = null;

  return async (client, params, renderOptions) => {
    if (renderFn === null) {
      // Absolute sqlPath skips findProjectRoot so callers embedding aathena
      // without an aathena.config.json (tests, custom build layouts) still
      // work. Codegen always emits relative paths.
      const absolutePath = isAbsolute(sqlPath)
        ? sqlPath
        : resolve(findProjectRoot(), sqlPath);
      const built = schemaDef
        ? sqlRenderDefine(absolutePath, schemaDef)
        : sqlRenderDefine<TParams & Record<string, string | number | boolean>>(absolutePath);
      renderFn = built as RenderFn;
    }
    const { sql } = renderFn(params as never, renderOptions);
    return client.query<TResult>(sql, options.database ? { database: options.database } : {});
  };
}

export { sqlRenderSchema as schema };
