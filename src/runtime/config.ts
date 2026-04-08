import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AathenaConfig } from './types';

export function defineConfig(config: AathenaConfig): AathenaConfig {
  return config;
}

export function loadConfig(cwd: string = process.cwd()): AathenaConfig {
  const configPath = resolve(cwd, 'aathena.config.json');

  try {
    const raw = readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as AathenaConfig;
  } catch {
    throw new Error(
      `Could not load aathena config. Expected aathena.config.json at ${cwd}.`,
    );
  }
}
