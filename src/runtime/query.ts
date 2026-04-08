import type { QueryResult } from './types';
import { AathenaClient } from './client';

// sql-render is used internally for template rendering
import { defineQuery as sqlRenderDefine, schema as sqlRenderSchema } from 'sql-render';

type QueryFn<TResult, TParams> = (
  client: AathenaClient,
  params: TParams,
) => Promise<QueryResult<TResult>>;

export function createQuery<TResult, TParams extends Record<string, unknown>>(
  sqlPath: string,
  schemaDef?: Record<string, { validate(val: unknown): boolean }>,
): QueryFn<TResult, TParams> {
  // Build the sql-render query function
  const renderFn = schemaDef
    ? sqlRenderDefine(sqlPath, schemaDef)
    : sqlRenderDefine<TParams & Record<string, string | number | boolean>>(sqlPath);

  return async (client, params) => {
    const { sql } = renderFn(params as never);
    return client.query<TResult>(sql);
  };
}

export { sqlRenderSchema as schema };
