/**
 * Minimal CLI flag parser. Supports:
 *   --flag            -> true
 *   --no-flag         -> false
 *   --key value       -> "value"
 *   --key=value       -> "value"
 * Positional arguments are returned as `positional`.
 *
 * Kept tiny on purpose; we don't want yargs as a dependency for a handful
 * of flags.
 */

export interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const rest = arg.slice(2);
    const eqIdx = rest.indexOf('=');

    if (eqIdx !== -1) {
      flags[rest.slice(0, eqIdx)] = rest.slice(eqIdx + 1);
      continue;
    }

    if (rest.startsWith('no-')) {
      flags[rest.slice(3)] = false;
      continue;
    }

    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[rest] = next;
      i++;
    } else {
      flags[rest] = true;
    }
  }

  return { positional, flags };
}

export function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' ? v : undefined;
}

export function flagBool(flags: Record<string, string | boolean>, key: string): boolean | undefined {
  const v = flags[key];
  return typeof v === 'boolean' ? v : undefined;
}
