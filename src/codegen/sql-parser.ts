/**
 * Extracts {{variable}} placeholders from SQL and infers their types
 * from surrounding SQL context.
 *
 * Hybrid approach:
 * 1. @param annotations take priority (explicit)
 * 2. SQL context inference as fallback (automatic)
 */

export interface ParsedParam {
  name: string;
  type: string;        // TypeScript type: 'string' | 'number' | 'boolean' | string
  schemaType?: string; // sql-render schema type: 'enum' | 'positiveInt' | 'isoDate' etc.
  enumValues?: string[];
  inferred: boolean;   // true = auto-inferred, false = @param annotation
}

export interface ParsedSQL {
  params: ParsedParam[];
  rawSQL: string;
}

const PLACEHOLDER_REGEX = /\{\{(\w+)\}\}/g;

const PARAM_ANNOTATION_REGEX =
  /^--\s*@param\s+(\w+)\s+(enum\(([^)]+)\)|string|number|boolean|positiveInt|isoDate|isoTimestamp|identifier|uuid|s3Path)\s*$/;

/**
 * Parse @param annotations from SQL comments.
 *
 * Format: -- @param name type
 * Examples:
 *   -- @param status enum('active','pending')
 *   -- @param rowLimit positiveInt
 *   -- @param startDate isoDate
 */
function parseAnnotations(sql: string): Map<string, ParsedParam> {
  const annotations = new Map<string, ParsedParam>();

  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(PARAM_ANNOTATION_REGEX);
    if (!match) continue;

    const name = match[1];
    const rawType = match[2];

    if (rawType.startsWith('enum(')) {
      const values = match[3]
        .split(',')
        .map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
      annotations.set(name, {
        name,
        type: values.map((v) => `'${v}'`).join(' | '),
        schemaType: 'enum',
        enumValues: values,
        inferred: false,
      });
    } else {
      annotations.set(name, {
        name,
        type: schemaToTsType(rawType),
        schemaType: rawType,
        inferred: false,
      });
    }
  }

  return annotations;
}

function schemaToTsType(schemaType: string): string {
  switch (schemaType) {
    case 'string':
    case 'identifier':
    case 'uuid':
    case 'isoDate':
    case 'isoTimestamp':
    case 's3Path':
      return 'string';
    case 'number':
    case 'positiveInt':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'string';
  }
}

/**
 * Infer param type from surrounding SQL context.
 *
 * Rules:
 * - '{{var}}'         → string (quoted context)
 * - LIMIT {{var}}     → number
 * - OFFSET {{var}}    → number
 * - = {{var}}         → number (unquoted equality, likely numeric)
 * - default           → string
 */
function inferTypeFromContext(sql: string, paramName: string): ParsedParam {
  // Check if in quoted context: '{{var}}'
  const quotedPattern = new RegExp(`'\\{\\{${paramName}\\}\\}'`);
  if (quotedPattern.test(sql)) {
    return { name: paramName, type: 'string', inferred: true };
  }

  // Check LIMIT / OFFSET context
  const limitPattern = new RegExp(
    `\\b(LIMIT|OFFSET)\\s+\\{\\{${paramName}\\}\\}`,
    'i',
  );
  if (limitPattern.test(sql)) {
    return { name: paramName, type: 'number', schemaType: 'positiveInt', inferred: true };
  }

  // Check numeric comparison: >= {{var}}, <= {{var}}, > {{var}}, < {{var}}, != {{var}}, = {{var}}
  const numericCompare = new RegExp(
    `(?:>=|<=|<>|!=|>|<|=)\\s*\\{\\{${paramName}\\}\\}`,
  );
  const quotedCompare = new RegExp(
    `(?:>=|<=|<>|!=|>|<|=)\\s*'\\{\\{${paramName}\\}\\}'`,
  );
  if (numericCompare.test(sql) && !quotedCompare.test(sql)) {
    return { name: paramName, type: 'number', schemaType: 'number', inferred: true };
  }

  // Default: string
  return { name: paramName, type: 'string', inferred: true };
}

export function parseSQL(sql: string): ParsedSQL {
  const annotations = parseAnnotations(sql);

  // Extract all unique placeholders
  const seen = new Set<string>();
  const params: ParsedParam[] = [];
  let match: RegExpExecArray | null;

  // Reset regex
  PLACEHOLDER_REGEX.lastIndex = 0;
  while ((match = PLACEHOLDER_REGEX.exec(sql)) !== null) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);

    // Annotation takes priority over inference
    const annotation = annotations.get(name);
    if (annotation) {
      params.push(annotation);
    } else {
      params.push(inferTypeFromContext(sql, name));
    }
  }

  return { params, rawSQL: sql };
}
