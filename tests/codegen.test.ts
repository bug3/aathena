import { describe, it, expect } from 'vitest';
import { generateTypeFile } from '../src/codegen/type-generator';
import { generateQueryFile } from '../src/codegen/query-generator';
import { parseSQL } from '../src/codegen/sql-parser';
import type { TableSchema } from '../src/codegen/glue-fetcher';

describe('generateTypeFile', () => {
  it('generates interface from table schema', () => {
    const schema: TableSchema = {
      database: 'mydb',
      tableName: 'events',
      columns: [
        { name: 'event_id', type: 'integer' },
        { name: 'event_name', type: 'varchar' },
        { name: 'is_active', type: 'boolean' },
        { name: 'price', type: 'decimal(10,2)' },
        { name: 'created_at', type: 'timestamp' },
        { name: 'tags', type: 'array<varchar>' },
      ],
    };

    const output = generateTypeFile(schema);

    expect(output).toContain('export interface Events {');
    expect(output).toContain('event_id: number;');
    expect(output).toContain('event_name: string;');
    expect(output).toContain('is_active: boolean;');
    expect(output).toContain('price: string;');
    expect(output).toContain('created_at: Date;');
    expect(output).toContain('tags: string[];');
    expect(output).toContain('Source: mydb.events');
    expect(output).toContain('do not edit');
  });
});

describe('generateQueryFile', () => {
  it('generates query file with inferred params', () => {
    const sql = `SELECT * FROM events WHERE status = '{{status}}' LIMIT {{limit}}`;
    const parsed = parseSQL(sql);

    const output = generateQueryFile({
      sqlRelativePath: 'tables/mydb/events/product.sql',
      tableName: 'events',
      database: 'mydb',
      parsed,
      typesImportPath: '../../types/mydb/events',
    });

    expect(output).toContain("import { createQuery } from 'aathena/runtime'");
    expect(output).toContain("import type { Events } from '../../types/mydb/events'");
    expect(output).toContain('export interface ProductParams {');
    expect(output).toContain('status: string;');
    expect(output).toContain('limit: number;');
    expect(output).toContain('export const product = createQuery');
    expect(output).toContain('tables/mydb/events/product.sql');
  });

  it('generates query file with @param annotations and schema', () => {
    const sql = `-- @param status enum('active','pending')
-- @param limit positiveInt
SELECT * FROM events WHERE status = '{{status}}' LIMIT {{limit}}`;
    const parsed = parseSQL(sql);

    const output = generateQueryFile({
      sqlRelativePath: 'tables/mydb/events/product.sql',
      tableName: 'events',
      database: 'mydb',
      parsed,
      typesImportPath: '../../types/mydb/events',
    });

    expect(output).toContain("status: 'active' | 'pending';");
    expect(output).toContain("schema.enum('active', 'pending')");
    expect(output).toContain('schema.positiveInt');
    expect(output).toContain('schemaDef');
  });

  it('generates query file without params', () => {
    const sql = `SELECT COUNT(*) as cnt FROM events`;
    const parsed = parseSQL(sql);

    const output = generateQueryFile({
      sqlRelativePath: 'tables/mydb/events/count.sql',
      tableName: 'events',
      database: 'mydb',
      parsed,
      typesImportPath: '../../types/mydb/events',
    });

    expect(output).toContain('Record<string, never>');
    expect(output).not.toContain('Params');
  });
});
