import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { findProjectRoot, loadConfig } from '../src/runtime/config';

const TMP = resolve(__dirname, '__tmp_config_test__');

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

describe('findProjectRoot', () => {
  it('finds config in the start directory', () => {
    setup();
    writeFileSync(join(TMP, 'aathena.config.json'), '{"database":"db"}');

    expect(findProjectRoot(TMP)).toBe(TMP);
    teardown();
  });

  it('finds config in a parent directory', () => {
    setup();
    writeFileSync(join(TMP, 'aathena.config.json'), '{"database":"db"}');
    const nested = join(TMP, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });

    expect(findProjectRoot(nested)).toBe(TMP);
    teardown();
  });

  it('throws when no config is found', () => {
    setup();
    // TMP has no config file
    expect(() => findProjectRoot(TMP)).toThrow('Could not find aathena.config.json');
    teardown();
  });
});

describe('loadConfig', () => {
  it('loads config from explicit cwd', () => {
    setup();
    writeFileSync(
      join(TMP, 'aathena.config.json'),
      JSON.stringify({ database: 'mydb', region: 'eu-west-1' }),
    );

    const config = loadConfig(TMP);
    expect(config.database).toBe('mydb');
    expect(config.region).toBe('eu-west-1');
    teardown();
  });

  it('loads config by walking up when cwd is omitted', () => {
    setup();
    writeFileSync(
      join(TMP, 'aathena.config.json'),
      JSON.stringify({ database: 'testdb' }),
    );
    const nested = join(TMP, 'src', 'deep');
    mkdirSync(nested, { recursive: true });

    // Temporarily override process.cwd
    const original = process.cwd;
    process.cwd = () => nested;
    try {
      const config = loadConfig();
      expect(config.database).toBe('testdb');
    } finally {
      process.cwd = original;
    }
    teardown();
  });
});
