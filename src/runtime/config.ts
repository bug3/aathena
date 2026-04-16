import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { AathenaConfig } from './types';

const CONFIG_FILE = 'aathena.config.json';

export function defineConfig(config: AathenaConfig): AathenaConfig {
  return config;
}

/**
 * Walk up from `startDir` until we find `aathena.config.json`.
 * Returns the directory that contains it (the project root).
 */
export function findProjectRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);

  while (true) {
    if (existsSync(resolve(dir, CONFIG_FILE))) {
      return dir;
    }

    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Could not find ${CONFIG_FILE} in ${startDir} or any parent directory.`,
      );
    }
    dir = parent;
  }
}

export function loadConfig(cwd?: string): AathenaConfig {
  const root = cwd ? resolve(cwd) : findProjectRoot();
  const configPath = resolve(root, CONFIG_FILE);

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch {
    throw new Error(
      `Could not load aathena config. Expected ${CONFIG_FILE} at ${root}.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid JSON in ${configPath}: ${(err as Error).message}`,
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Expected an object in ${configPath}.`);
  }

  const config = parsed as AathenaConfig;
  if (typeof config.database !== 'string' || config.database.length === 0) {
    throw new Error(
      `Missing required field 'database' in ${configPath}.`,
    );
  }

  return config;
}
