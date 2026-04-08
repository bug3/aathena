import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AathenaConfig } from './types';

export function defineConfig(config: AathenaConfig): AathenaConfig {
  return config;
}

export function loadConfig(cwd: string = process.cwd()): AathenaConfig {
  const configPath = resolve(cwd, 'aathena.config.ts');

  // For runtime usage, read the config as JSON or use dynamic import
  // In practice, the CLI will handle .ts config via tsx/jiti
  try {
    // Try JSON config first
    const jsonPath = resolve(cwd, 'aathena.config.json');
    const raw = readFileSync(jsonPath, 'utf-8');
    return JSON.parse(raw) as AathenaConfig;
  } catch {
    throw new Error(
      `Could not load aathena config. Expected aathena.config.json at ${cwd}. ` +
      `Config path attempted: ${configPath}`,
    );
  }
}
