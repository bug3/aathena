import { ColumnParseError } from './errors';
import type { ColumnMeta } from './types';

type Parser = (value: string, column: string) => unknown;

const identity: Parser = (v) => v;

const parseInteger: Parser = (v, col) => {
  const n = Number(v);
  if (!Number.isInteger(n)) throw new ColumnParseError(col, v, 'integer');
  return n;
};

const parseFloat64: Parser = (v, col) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new ColumnParseError(col, v, 'double/float');
  return n;
};

const parseBoolean: Parser = (v, col) => {
  if (v === 'true') return true;
  if (v === 'false') return false;
  throw new ColumnParseError(col, v, 'boolean');
};

const parseTimestamp: Parser = (v, col) => {
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) throw new ColumnParseError(col, v, 'timestamp');
  return d;
};

const parseBigInt: Parser = (v, col) => {
  try {
    return BigInt(v);
  } catch {
    throw new ColumnParseError(col, v, 'bigint');
  }
};

const parseJson: Parser = (v, col) => {
  try {
    return JSON.parse(v);
  } catch {
    throw new ColumnParseError(col, v, 'json');
  }
};

function getParser(athenaType: string): Parser {
  const t = athenaType.toLowerCase().trim();

  if (t === 'boolean') return parseBoolean;
  if (t === 'tinyint' || t === 'smallint' || t === 'integer' || t === 'int') return parseInteger;
  if (t === 'bigint') return parseBigInt;
  if (t === 'double' || t === 'float' || t === 'real') return parseFloat64;
  if (t === 'decimal' || t.startsWith('decimal(')) return identity; // string for precision
  if (t === 'date') return identity; // YYYY-MM-DD string
  if (t === 'timestamp') return parseTimestamp;
  if (t === 'json') return parseJson;
  if (t.startsWith('array') || t.startsWith('map') || t.startsWith('struct')) return parseJson;

  // varchar, string, char, binary, unknown → string
  return identity;
}

export function parseRow<T>(
  columns: ColumnMeta[],
  rowData: (string | undefined)[],
): T {
  const obj: Record<string, unknown> = {};

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    const raw = rowData[i];

    if (raw === undefined || raw === null || raw === '') {
      obj[col.name] = null;
      continue;
    }

    const parser = getParser(col.type);
    obj[col.name] = parser(raw, col.name);
  }

  return obj as T;
}

export { getParser };
