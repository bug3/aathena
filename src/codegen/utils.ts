export function pascalCase(str: string): string {
  return str
    .split(/[_\-\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join('');
}

export function camelCase(str: string): string {
  const pascal = pascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/**
 * ECMAScript reserved words and strict-mode-only reserved identifiers. A
 * generated `export const <name> =` produces a SyntaxError when `<name>` is
 * any of these, so codegen suffixes with `_` to keep the output compilable.
 */
export const JS_RESERVED_WORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'enum', 'export', 'extends',
  'false', 'finally', 'for', 'function', 'if', 'import', 'in',
  'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
  // strict mode / module context
  'await', 'implements', 'interface', 'let', 'package', 'private',
  'protected', 'public', 'static', 'yield',
]);

export function isReservedWord(name: string): boolean {
  return JS_RESERVED_WORDS.has(name);
}

/**
 * Returns `name` unchanged unless it collides with a JS reserved word, in
 * which case it appends `_`. Use this anywhere codegen emits an identifier
 * that will appear as `const <name> =` or `function <name>(...)`.
 */
export function safeIdentifier(name: string): string {
  return isReservedWord(name) ? name + '_' : name;
}
