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
  // Athena returns timestamps as 'YYYY-MM-DD HH:MM:SS.sss' (timezone-naive).
  // Replace space with 'T' for ISO 8601 parsing without appending 'Z',
  // so the timestamp is interpreted in the local timezone (matching Athena's behavior).
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T'));
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

/**
 * Parse Athena's native complex type format.
 *
 * Athena returns structs/maps/arrays NOT as JSON but in its own format:
 *   struct: {key=value, key2=value2}
 *   array:  [val1, val2, val3]
 *   map:    {key=value}
 *   null:   null
 *   nested: {key={nested_key=val}, arr=[1, 2]}
 *
 * This parser handles arbitrary nesting depth.
 */
function parseAthenaValue(s: string, pos: number): [unknown, number] {
  // Skip whitespace
  while (pos < s.length && s[pos] === ' ') pos++;

  if (pos >= s.length) return [null, pos];

  // null
  if (s.startsWith('null', pos) && (pos + 4 >= s.length || ',}] '.includes(s[pos + 4]))) {
    return [null, pos + 4];
  }

  // boolean
  if (s.startsWith('true', pos) && (pos + 4 >= s.length || ',}] '.includes(s[pos + 4]))) {
    return [true, pos + 4];
  }
  if (s.startsWith('false', pos) && (pos + 5 >= s.length || ',}] '.includes(s[pos + 5]))) {
    return [false, pos + 5];
  }

  // array
  if (s[pos] === '[') {
    return parseAthenaArray(s, pos);
  }

  // struct / map
  if (s[pos] === '{') {
    return parseAthenaStruct(s, pos);
  }

  // scalar value (string or number) - read until delimiter
  return parseAthenaScalar(s, pos);
}

function parseAthenaArray(s: string, pos: number): [unknown[], number] {
  pos++; // skip '['
  const result: unknown[] = [];

  while (pos < s.length && s[pos] !== ']') {
    while (pos < s.length && s[pos] === ' ') pos++;
    if (s[pos] === ']') break;

    const [val, nextPos] = parseAthenaValue(s, pos);
    result.push(val);
    pos = nextPos;

    while (pos < s.length && s[pos] === ' ') pos++;
    if (s[pos] === ',') pos++;
  }

  if (pos < s.length) pos++; // skip ']'
  return [result, pos];
}

function parseAthenaStruct(s: string, pos: number): [Record<string, unknown>, number] {
  pos++; // skip '{'
  const result: Record<string, unknown> = {};

  while (pos < s.length && s[pos] !== '}') {
    while (pos < s.length && s[pos] === ' ') pos++;
    if (s[pos] === '}') break;

    // Read key (until '=')
    const eqIdx = s.indexOf('=', pos);
    if (eqIdx === -1) break;
    const key = s.slice(pos, eqIdx).trim();
    pos = eqIdx + 1;

    // Read value
    const [val, nextPos] = parseAthenaValue(s, pos);
    result[key] = val;
    pos = nextPos;

    while (pos < s.length && s[pos] === ' ') pos++;
    if (s[pos] === ',') pos++;
  }

  if (pos < s.length) pos++; // skip '}'
  return [result, pos];
}

function parseAthenaScalar(s: string, pos: number): [string | number, number] {
  const start = pos;
  while (pos < s.length && !',}]'.includes(s[pos])) {
    pos++;
  }
  const raw = s.slice(start, pos).trim();

  // Try to parse as number
  if (/^-?\d+(\.\d+)?$/.test(raw)) {
    return [Number(raw), pos];
  }

  return [raw, pos];
}

const parseComplexType: Parser = (v, col) => {
  // Try JSON first (some Athena versions / formats may return JSON)
  try {
    return JSON.parse(v);
  } catch {
    // Fall through to Athena format parser
  }

  try {
    const [result] = parseAthenaValue(v, 0);
    return result;
  } catch {
    throw new ColumnParseError(col, v, 'complex type');
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
  if (t.startsWith('array') || t.startsWith('map') || t.startsWith('struct')) return parseComplexType;

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

    if (raw === undefined || raw === null) {
      obj[col.name] = null;
      continue;
    }

    const parser = getParser(col.type);
    obj[col.name] = parser(raw, col.name);
  }

  return obj as T;
}

export { getParser };
