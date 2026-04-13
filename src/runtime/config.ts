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

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as AathenaConfig;
  } catch {
    throw new Error(
      `Could not load aathena config. Expected ${CONFIG_FILE} at ${root}.`,
    );
  }
}
