import { describe, it, expect } from 'vitest';
import { athenaTypeToTS } from '../src/codegen/type-map';

describe('athenaTypeToTS', () => {
  it('maps primitive types', () => {
    expect(athenaTypeToTS('boolean')).toBe('boolean');
    expect(athenaTypeToTS('tinyint')).toBe('number');
    expect(athenaTypeToTS('smallint')).toBe('number');
    expect(athenaTypeToTS('integer')).toBe('number');
    expect(athenaTypeToTS('int')).toBe('number');
    expect(athenaTypeToTS('bigint')).toBe('number');
    expect(athenaTypeToTS('double')).toBe('number');
    expect(athenaTypeToTS('float')).toBe('number');
    expect(athenaTypeToTS('real')).toBe('number');
  });

  it('maps string types', () => {
    expect(athenaTypeToTS('varchar')).toBe('string');
    expect(athenaTypeToTS('varchar(255)')).toBe('string');
    expect(athenaTypeToTS('string')).toBe('string');
    expect(athenaTypeToTS('char')).toBe('string');
    expect(athenaTypeToTS('char(10)')).toBe('string');
  });

  it('maps decimal to string', () => {
    expect(athenaTypeToTS('decimal')).toBe('string');
    expect(athenaTypeToTS('decimal(10,2)')).toBe('string');
  });

  it('maps date to string', () => {
    expect(athenaTypeToTS('date')).toBe('string');
  });

  it('maps timestamp to Date', () => {
    expect(athenaTypeToTS('timestamp')).toBe('Date');
  });

  it('maps json to unknown', () => {
    expect(athenaTypeToTS('json')).toBe('unknown');
  });

  it('maps array types', () => {
    expect(athenaTypeToTS('array<varchar>')).toBe('string[]');
    expect(athenaTypeToTS('array<integer>')).toBe('number[]');
    expect(athenaTypeToTS('array<boolean>')).toBe('boolean[]');
  });

  it('maps map types', () => {
    expect(athenaTypeToTS('map<string, integer>')).toBe('Record<string, number>');
    expect(athenaTypeToTS('map<string, string>')).toBe('Record<string, string>');
  });

  it('maps struct types', () => {
    expect(athenaTypeToTS('struct<name:string, age:integer>')).toBe('{ name: string; age: number }');
  });

  it('maps nested complex types', () => {
    expect(athenaTypeToTS('array<array<integer>>')).toBe('number[][]');
  });

  it('falls back to string for unknown types', () => {
    expect(athenaTypeToTS('somethingweird')).toBe('string');
  });
});
