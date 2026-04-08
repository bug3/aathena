import { describe, it, expect } from 'vitest';
import { parseRow } from '../src/runtime/parser';
import { ColumnParseError } from '../src/runtime/errors';
import type { ColumnMeta } from '../src/runtime/types';

describe('parseRow', () => {
  it('parses varchar to string', () => {
    const columns: ColumnMeta[] = [{ name: 'name', type: 'varchar', nullable: false }];
    const row = parseRow<{ name: string }>(columns, ['hello']);
    expect(row.name).toBe('hello');
  });

  it('parses integer to number', () => {
    const columns: ColumnMeta[] = [{ name: 'id', type: 'integer', nullable: false }];
    const row = parseRow<{ id: number }>(columns, ['42']);
    expect(row.id).toBe(42);
  });

  it('parses bigint to BigInt', () => {
    const columns: ColumnMeta[] = [{ name: 'big', type: 'bigint', nullable: false }];
    const row = parseRow<{ big: bigint }>(columns, ['9007199254740993']);
    expect(row.big).toBe(9007199254740993n);
  });

  it('parses boolean true', () => {
    const columns: ColumnMeta[] = [{ name: 'active', type: 'boolean', nullable: false }];
    const row = parseRow<{ active: boolean }>(columns, ['true']);
    expect(row.active).toBe(true);
  });

  it('parses boolean false', () => {
    const columns: ColumnMeta[] = [{ name: 'active', type: 'boolean', nullable: false }];
    const row = parseRow<{ active: boolean }>(columns, ['false']);
    expect(row.active).toBe(false);
  });

  it('parses double to number', () => {
    const columns: ColumnMeta[] = [{ name: 'price', type: 'double', nullable: false }];
    const row = parseRow<{ price: number }>(columns, ['3.14']);
    expect(row.price).toBeCloseTo(3.14);
  });

  it('keeps decimal as string', () => {
    const columns: ColumnMeta[] = [{ name: 'amount', type: 'decimal(10,2)', nullable: false }];
    const row = parseRow<{ amount: string }>(columns, ['123.45']);
    expect(row.amount).toBe('123.45');
  });

  it('keeps date as string', () => {
    const columns: ColumnMeta[] = [{ name: 'day', type: 'date', nullable: false }];
    const row = parseRow<{ day: string }>(columns, ['2024-01-15']);
    expect(row.day).toBe('2024-01-15');
  });

  it('parses timestamp to Date', () => {
    const columns: ColumnMeta[] = [{ name: 'ts', type: 'timestamp', nullable: false }];
    const row = parseRow<{ ts: Date }>(columns, ['2024-01-15 10:30:00.000']);
    expect(row.ts).toBeInstanceOf(Date);
    expect(row.ts.getFullYear()).toBe(2024);
  });

  it('parses null/empty to null', () => {
    const columns: ColumnMeta[] = [{ name: 'val', type: 'varchar', nullable: true }];
    const row = parseRow<{ val: string | null }>(columns, [undefined]);
    expect(row.val).toBeNull();
  });

  it('parses multiple columns', () => {
    const columns: ColumnMeta[] = [
      { name: 'id', type: 'integer', nullable: false },
      { name: 'name', type: 'varchar', nullable: false },
      { name: 'active', type: 'boolean', nullable: false },
    ];
    const row = parseRow<{ id: number; name: string; active: boolean }>(
      columns,
      ['1', 'test', 'true'],
    );
    expect(row).toEqual({ id: 1, name: 'test', active: true });
  });

  it('throws ColumnParseError for invalid integer', () => {
    const columns: ColumnMeta[] = [{ name: 'id', type: 'integer', nullable: false }];
    expect(() => parseRow(columns, ['not_a_number'])).toThrow(ColumnParseError);
  });

  it('throws ColumnParseError for invalid boolean', () => {
    const columns: ColumnMeta[] = [{ name: 'flag', type: 'boolean', nullable: false }];
    expect(() => parseRow(columns, ['yes'])).toThrow(ColumnParseError);
  });
});
