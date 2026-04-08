import { describe, it, expect } from 'vitest';
import { parseSQL } from '../src/codegen/sql-parser';

describe('parseSQL', () => {
  describe('placeholder extraction', () => {
    it('extracts simple placeholders', () => {
      const sql = `SELECT * FROM events WHERE status = '{{status}}' LIMIT {{limit}}`;
      const result = parseSQL(sql);

      expect(result.params).toHaveLength(2);
      expect(result.params[0].name).toBe('status');
      expect(result.params[1].name).toBe('limit');
    });

    it('deduplicates repeated placeholders', () => {
      const sql = `SELECT * FROM events WHERE a = '{{name}}' OR b = '{{name}}'`;
      const result = parseSQL(sql);

      expect(result.params).toHaveLength(1);
      expect(result.params[0].name).toBe('name');
    });

    it('returns empty for SQL without placeholders', () => {
      const sql = `SELECT * FROM events`;
      const result = parseSQL(sql);

      expect(result.params).toHaveLength(0);
    });
  });

  describe('context-based type inference', () => {
    it('infers string for quoted placeholders', () => {
      const sql = `SELECT * FROM events WHERE status = '{{status}}'`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('string');
      expect(result.params[0].inferred).toBe(true);
    });

    it('infers number for LIMIT', () => {
      const sql = `SELECT * FROM events LIMIT {{limit}}`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('number');
      expect(result.params[0].schemaType).toBe('positiveInt');
    });

    it('infers number for OFFSET', () => {
      const sql = `SELECT * FROM events LIMIT 10 OFFSET {{skip}}`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('number');
    });

    it('infers number for unquoted comparison', () => {
      const sql = `SELECT * FROM events WHERE price >= {{minPrice}}`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('number');
    });

    it('infers string for quoted comparison (not number)', () => {
      const sql = `SELECT * FROM events WHERE created_at >= '{{startDate}}'`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('string');
    });

    it('defaults to string for ambiguous context', () => {
      const sql = `SELECT * FROM {{tableName}}`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('string');
    });
  });

  describe('@param annotations', () => {
    it('parses enum annotation', () => {
      const sql = `-- @param status enum('active','pending','done')
SELECT * FROM events WHERE status = '{{status}}'`;
      const result = parseSQL(sql);

      expect(result.params[0].name).toBe('status');
      expect(result.params[0].type).toBe("'active' | 'pending' | 'done'");
      expect(result.params[0].schemaType).toBe('enum');
      expect(result.params[0].enumValues).toEqual(['active', 'pending', 'done']);
      expect(result.params[0].inferred).toBe(false);
    });

    it('parses positiveInt annotation', () => {
      const sql = `-- @param limit positiveInt
SELECT * FROM events LIMIT {{limit}}`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('number');
      expect(result.params[0].schemaType).toBe('positiveInt');
      expect(result.params[0].inferred).toBe(false);
    });

    it('parses isoDate annotation', () => {
      const sql = `-- @param startDate isoDate
SELECT * FROM events WHERE created_at >= '{{startDate}}'`;
      const result = parseSQL(sql);

      expect(result.params[0].type).toBe('string');
      expect(result.params[0].schemaType).toBe('isoDate');
    });

    it('annotation overrides context inference', () => {
      const sql = `-- @param limit number
SELECT * FROM events LIMIT {{limit}}`;
      const result = parseSQL(sql);

      // Annotation says 'number', context would also say number/positiveInt
      // But annotation takes priority (inferred = false)
      expect(result.params[0].inferred).toBe(false);
      expect(result.params[0].schemaType).toBe('number');
    });

    it('mixes annotations with inferred params', () => {
      const sql = `-- @param status enum('active','pending')
SELECT * FROM events WHERE status = '{{status}}' LIMIT {{limit}}`;
      const result = parseSQL(sql);

      expect(result.params[0].name).toBe('status');
      expect(result.params[0].inferred).toBe(false);

      expect(result.params[1].name).toBe('limit');
      expect(result.params[1].inferred).toBe(true);
      expect(result.params[1].type).toBe('number');
    });
  });
});
