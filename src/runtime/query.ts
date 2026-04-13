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

export function createQuery<TResult, TParams = Record<string, never>>(
  sqlPath: string,
  schemaDef?: Record<string, { validate(val: unknown): boolean }>,
): QueryFn<TResult, TParams> {
  // Resolve relative sqlPath against the project root (where aathena.config.json lives)
  const absolutePath = resolve(findProjectRoot(), sqlPath);

  // Build the sql-render query function
  const renderFn = schemaDef
    ? sqlRenderDefine(absolutePath, schemaDef)
    : sqlRenderDefine<TParams & Record<string, string | number | boolean>>(absolutePath);

  return async (client, params) => {
    const { sql } = renderFn(params as never);
    return client.query<TResult>(sql);
  };
}

export { sqlRenderSchema as schema };
