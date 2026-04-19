import { resolve } from 'node:path';
import type { QueryResult } from './types';
import { AathenaClient } from './client';
import { findProjectRoot } from './config';

// sql-render is used internally for template rendering
import { defineQuery as sqlRenderDefine, schema as sqlRenderSchema } from 'sql-render';

type QueryFn<TResult, TParams> = (
  client: AathenaClient,
  params: TParams,
) => Promise<QueryResult<TResult>>;

export interface CreateQueryOptions {
  /**
   * Execution context database for this query. Takes precedence over
   * AathenaConfig.database. Emitted by codegen when the query's directory
   * database differs from the project's primary database.
   */
  database?: string;
}

export function createQuery<TResult, TParams = Record<string, never>>(
  sqlPath: string,
  schemaDef?: Record<string, { validate(val: unknown): boolean }>,
  options: CreateQueryOptions = {},
): QueryFn<TResult, TParams> {
  // Defer project-root lookup and template load until the first call, so
  // importing a generated query doesn't trigger filesystem I/O at module
  // load time (important for bundled Lambda deploys and test isolation).
  type RenderFn = (values: never) => { sql: string };
  let renderFn: RenderFn | null = null;

  return async (client, params) => {
    if (renderFn === null) {
      const absolutePath = resolve(findProjectRoot(), sqlPath);
      const built = schemaDef
        ? sqlRenderDefine(absolutePath, schemaDef)
        : sqlRenderDefine<TParams & Record<string, string | number | boolean>>(absolutePath);
      renderFn = built as RenderFn;
    }
    const { sql } = renderFn(params as never);
    return client.query<TResult>(sql, options.database ? { database: options.database } : {});
  };
}

export { sqlRenderSchema as schema };
