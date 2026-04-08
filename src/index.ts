// Public API
export { AathenaClient, createClient } from './runtime/client';
export { createQuery, schema } from './runtime/query';
export { defineConfig } from './runtime/config';

export type { AathenaConfig, QueryResult, ColumnMeta } from './runtime/types';
export {
  AathenaError,
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
  ColumnParseError,
} from './runtime/errors';
