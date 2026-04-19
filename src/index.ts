// Public API
export { AathenaClient, createClient } from './runtime/client';
export { createQuery, schema } from './runtime/query';
export { defineConfig } from './runtime/config';
export { parallel } from './runtime/parallel';
export type { ParallelOptions } from './runtime/parallel';
export type { QuotaKind } from './runtime/limits';

export type {
  AathenaConfig,
  QueryResult,
  QueryStatistics,
  QueryRuntimeRows,
  QueryOptions,
  ColumnMeta,
} from './runtime/types';
export {
  AathenaError,
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
  ColumnParseError,
} from './runtime/errors';
