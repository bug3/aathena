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
    const row = parseRow<{ id: number }>(columns, ['33']);
    expect(row.id).toBe(33);
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
    const row = parseRow<{ day: string }>(columns, ['2022-02-22']);
    expect(row.day).toBe('2022-02-22');
  });

  it('parses timestamp to Date', () => {
    const columns: ColumnMeta[] = [{ name: 'ts', type: 'timestamp', nullable: false }];
    const row = parseRow<{ ts: Date }>(columns, ['2022-02-22 22:02:22.000']);
    expect(row.ts).toBeInstanceOf(Date);
    expect(row.ts.getFullYear()).toBe(2022);
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

  it('parses array type via JSON', () => {
    const columns: ColumnMeta[] = [{ name: 'tags', type: 'array<varchar>', nullable: false }];
    const row = parseRow<{ tags: string[] }>(columns, ['["a","b","c"]']);
    expect(row.tags).toEqual(['a', 'b', 'c']);
  });

  it('parses map type via JSON', () => {
    const columns: ColumnMeta[] = [{ name: 'meta', type: 'map<string,integer>', nullable: false }];
    const row = parseRow<{ meta: Record<string, number> }>(columns, ['{"x":1,"y":2}']);
    expect(row.meta).toEqual({ x: 1, y: 2 });
  });

  it('parses struct type via JSON', () => {
    const columns: ColumnMeta[] = [{ name: 'addr', type: 'struct<city:string,zip:integer>', nullable: false }];
    const row = parseRow<{ addr: { city: string; zip: number } }>(columns, ['{"city":"NYC","zip":10001}']);
    expect(row.addr).toEqual({ city: 'NYC', zip: 10001 });
  });

  it('parses nested array type', () => {
    const columns: ColumnMeta[] = [{ name: 'matrix', type: 'array<array<integer>>', nullable: false }];
    const row = parseRow<{ matrix: number[][] }>(columns, ['[[1,2],[3,4]]']);
    expect(row.matrix).toEqual([[1, 2], [3, 4]]);
  });

  it('parses Athena struct format (key=value)', () => {
    const columns: ColumnMeta[] = [{ name: 'browser', type: 'struct<name:string,platform:string>', nullable: false }];
    const row = parseRow<{ browser: { name: string; platform: string } }>(columns, ['{name=Chrome, platform=mobile}']);
    expect(row.browser).toEqual({ name: 'Chrome', platform: 'mobile' });
  });

  it('parses Athena nested struct format', () => {
    const columns: ColumnMeta[] = [{ name: 'data', type: 'struct<count:int,info:struct<city:string,zip:int>>', nullable: false }];
    const row = parseRow<{ data: { count: number; info: { city: string; zip: number } } }>(
      columns,
      ['{count=5, info={city=NYC, zip=10001}}'],
    );
    expect(row.data).toEqual({ count: 5, info: { city: 'NYC', zip: 10001 } });
  });

  it('parses Athena struct with null values', () => {
    const columns: ColumnMeta[] = [{ name: 'data', type: 'struct<a:string,b:int>', nullable: false }];
    const row = parseRow<{ data: { a: string | null; b: number | null } }>(columns, ['{a=hello, b=null}']);
    expect(row.data).toEqual({ a: 'hello', b: null });
  });

  it('parses Athena struct with array field', () => {
    const columns: ColumnMeta[] = [{ name: 'data', type: 'struct<tags:array<string>,ok:boolean>', nullable: false }];
    const row = parseRow<{ data: { tags: string[]; ok: boolean } }>(columns, ['{tags=[a, b, c], ok=true}']);
    expect(row.data).toEqual({ tags: ['a', 'b', 'c'], ok: true });
  });

  it('parses Athena array of structs', () => {
    const columns: ColumnMeta[] = [{ name: 'items', type: 'array<struct<id:int,name:string>>', nullable: false }];
    const row = parseRow<{ items: { id: number; name: string }[] }>(columns, ['[{id=1, name=foo}, {id=2, name=bar}]']);
    expect(row.items).toEqual([{ id: 1, name: 'foo' }, { id: 2, name: 'bar' }]);
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
