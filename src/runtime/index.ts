export { AathenaClient, createClient } from './client';
export { createQuery, schema } from './query';
export { defineConfig, findProjectRoot } from './config';

export type { AathenaConfig, QueryResult, ColumnMeta } from './types';
export {
  AathenaError,
  QueryTimeoutError,
  QueryFailedError,
  QueryCancelledError,
  ColumnParseError,
} from './errors';
