import { describe, it, expect } from 'vitest';
import { parseTarget, buildQuerySql } from '../src/cli/commands/add';
import type { GlueColumn } from '../src/codegen/glue-fetcher';

describe('parseTarget', () => {
  it('uses fallback database when only a table is given', () => {
    expect(parseTarget('events', 'primary_db')).toEqual({
      database: 'primary_db',
      tableName: 'events',
    });
  });

  it('parses database.table', () => {
    expect(parseTarget('sales.events', 'primary_db')).toEqual({
      database: 'sales',
      tableName: 'events',
    });
  });

  it('trims whitespace', () => {
    expect(parseTarget('  events  ', 'x')).toEqual({
      database: 'x',
      tableName: 'events',
    });
  });

  it('rejects empty input', () => {
    expect(parseTarget('', 'x')).toBeNull();
    expect(parseTarget('   ', 'x')).toBeNull();
  });

  it('rejects invalid characters', () => {
    expect(parseTarget('has space', 'x')).toBeNull();
    expect(parseTarget('has-dash', 'x')).toBeNull();
    expect(parseTarget('1leadingDigit', 'x')).toBeNull();
  });

  it('rejects more than two dot-separated parts', () => {
    expect(parseTarget('a.b.c', 'x')).toBeNull();
  });

  it('rejects empty database or table halves', () => {
    expect(parseTarget('.events', 'x')).toBeNull();
    expect(parseTarget('sales.', 'x')).toBeNull();
  });
});

describe('buildQuerySql', () => {
  it('writes a minimal starter query without columns', () => {
    const sql = buildQuerySql('events');
    expect(sql).toContain('FROM events');
    expect(sql).toContain('LIMIT 10');
    expect(sql).not.toContain('-- Columns:');
  });

  it('includes a padded column comment block when columns are provided', () => {
    const cols: GlueColumn[] = [
      { name: 'event_id', type: 'integer', nullable: false },
      { name: 'event_name', type: 'varchar', nullable: true },
      { name: 'created_at', type: 'timestamp', nullable: true },
    ];
    const sql = buildQuerySql('events', cols);
    expect(sql).toContain('-- Columns:');
    expect(sql).toContain('event_id    integer');
    expect(sql).toContain('event_name  varchar');
    expect(sql).toContain('created_at  timestamp');
  });

  it('skips the columns block when an empty array is passed', () => {
    const sql = buildQuerySql('events', []);
    expect(sql).not.toContain('-- Columns:');
  });

  it('does not include {{...}} placeholders the user did not write', () => {
    const sql = buildQuerySql('events');
    expect(sql).not.toMatch(/\{\{[^}]+\}\}/);
  });
});
