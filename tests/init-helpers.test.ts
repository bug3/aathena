import { describe, it, expect } from 'vitest';
import { buildConfig, mergeGitignore, buildSampleSql } from '../src/cli/commands/init';

describe('buildConfig', () => {
  it('includes only fields with values', () => {
    expect(buildConfig({ database: 'x' })).toEqual({ database: 'x' });
    expect(
      buildConfig({
        database: 'x',
        region: 'us-east-1',
        workgroup: 'primary',
        outputLocation: 's3://b/o/',
      }),
    ).toEqual({
      database: 'x',
      region: 'us-east-1',
      workgroup: 'primary',
      outputLocation: 's3://b/o/',
    });
  });

  it('drops empty strings and undefined fields', () => {
    const cfg = buildConfig({
      database: 'x',
      region: undefined,
      workgroup: undefined,
      outputLocation: undefined,
    });
    expect(cfg).toEqual({ database: 'x' });
  });
});

describe('mergeGitignore', () => {
  it('adds generated/ and node_modules/ when missing', () => {
    const out = mergeGitignore('');
    expect(out).toContain('generated/');
    expect(out).toContain('node_modules/');
    expect(out).toContain('# aathena');
  });

  it('skips already-present entries', () => {
    const src = 'node_modules/\ndist/\n';
    const out = mergeGitignore(src);
    expect(out.endsWith('generated/\n')).toBe(true);
    const occurrences = out.match(/node_modules\//g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it('returns input unchanged when everything is already present', () => {
    const src = 'node_modules/\ngenerated/\n';
    expect(mergeGitignore(src)).toBe(src);
  });

  it('does not duplicate on repeated invocations', () => {
    const first = mergeGitignore('');
    const second = mergeGitignore(first);
    expect(first).toBe(second);
  });
});

describe('buildSampleSql', () => {
  it('uses the provided table name in path and SQL', () => {
    const file = buildSampleSql('sampledb', 'events');
    expect(file.path).toBe('tables/sampledb/events/example.sql');
    expect(file.contents).toContain('FROM events');
    expect(file.contents).toContain('LIMIT 10');
  });

  it('falls back to example_table when no table is provided', () => {
    const file = buildSampleSql('sampledb');
    expect(file.path).toBe('tables/sampledb/example_table/example.sql');
    expect(file.contents).toContain('FROM example_table');
  });
});
