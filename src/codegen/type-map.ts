/**
 * Maps Athena/Glue column types to TypeScript types.
 */

export function athenaTypeToTS(athenaType: string): string {
  const t = athenaType.toLowerCase().trim();

  // Primitive types
  if (t === 'boolean') return 'boolean';
  if (t === 'tinyint' || t === 'smallint' || t === 'integer' || t === 'int') return 'number';
  if (t === 'bigint') return 'bigint';
  if (t === 'double' || t === 'float' || t === 'real') return 'number';
  if (t === 'date') return 'string';
  if (t === 'timestamp') return 'Date';
  if (t === 'json') return 'unknown';
  if (t === 'binary' || t === 'varbinary') return 'Buffer';

  // decimal(p,s) → string for precision safety
  if (t === 'decimal' || t.startsWith('decimal(')) return 'string';

  // varchar(n), char(n), string
  if (t === 'varchar' || t === 'string' || t === 'char' || t.startsWith('varchar(') || t.startsWith('char(')) {
    return 'string';
  }

  // Complex types
  const arrayMatch = t.match(/^array<(.+)>$/);
  if (arrayMatch) {
    return `${athenaTypeToTS(arrayMatch[1])}[]`;
  }

  const mapMatch = t.match(/^map<(.+?),\s*(.+)>$/);
  if (mapMatch) {
    return `Record<${athenaTypeToTS(mapMatch[1])}, ${athenaTypeToTS(mapMatch[2])}>`;
  }

  const structMatch = t.match(/^struct<(.+)>$/);
  if (structMatch) {
    return parseStructType(structMatch[1]);
  }

  // Unknown → string fallback
  return 'string';
}

function parseStructType(fields: string): string {
  const result: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of fields) {
    if (char === '<') depth++;
    if (char === '>') depth--;

    if (char === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());

  const props = result.map((field) => {
    const colonIdx = field.indexOf(':');
    const name = field.slice(0, colonIdx).trim();
    const type = field.slice(colonIdx + 1).trim();
    return `${name}: ${athenaTypeToTS(type)}`;
  });

  return `{ ${props.join('; ')} }`;
}
