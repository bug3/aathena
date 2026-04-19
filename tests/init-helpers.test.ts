import { describe, it, expect } from 'vitest';
import {
  buildConfig,
  mergeGitignore,
  buildSampleSql,
  buildMainExample,
  barrelExportName,
} from '../src/cli/commands/init';

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
  it('adds node_modules/ when missing', () => {
    const out = mergeGitignore('');
    expect(out).toContain('node_modules/');
    expect(out).toContain('# aathena');
  });

  it('does not add generated/', () => {
    const out = mergeGitignore('');
    expect(out).not.toContain('generated/');
  });

  it('appends node_modules/ when other entries exist but node_modules/ is missing', () => {
    const src = 'dist/\n';
    const out = mergeGitignore(src);
    expect(out.endsWith('node_modules/\n')).toBe(true);
    const occurrences = out.match(/node_modules\//g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  it('returns input unchanged when node_modules/ is already present', () => {
    const src = 'node_modules/\n';
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
    expect(file.path).toBe('tables/sampledb/events/default.sql');
    expect(file.queryName).toBe('default');
    expect(file.contents).toContain('FROM events');
    expect(file.contents).toContain('LIMIT {{limit}}');
  });

  it('falls back to example_table when no table is provided', () => {
    const file = buildSampleSql('sampledb');
    expect(file.path).toBe('tables/sampledb/example_table/default.sql');
    expect(file.contents).toContain('FROM example_table');
  });

  it('does not embed {{...}} in comment lines', () => {
    // sql-render treats any {{token}} in the file as a real param, including
    // ones that only appear in example comments. LIMIT {{limit}} in the body
    // is intentional; comments must stay clean.
    const file = buildSampleSql('sampledb', 'events');
    const commentLines = file.contents
      .split('\n')
      .filter((l) => l.trim().startsWith('--'));
    for (const line of commentLines) {
      expect(line).not.toMatch(/\{\{[^}]+\}\}/);
    }
  });

  it('emits WHERE + @param for each required partition', () => {
    const file = buildSampleSql('sampledb', 'events', [
      { name: 'tenant_id', type: 'string' },
      { name: 'dt', type: 'string' },
    ]);
    expect(file.contents).toContain('-- @param tenant_id string');
    expect(file.contents).toContain('-- @param dt string');
    expect(file.contents).toContain(`WHERE tenant_id = '{{tenant_id}}'`);
    expect(file.contents).toContain(`AND dt = '{{dt}}'`);
  });
});

describe('barrelExportName', () => {
  it('aliases reserved query names with {table}{Query}', () => {
    expect(barrelExportName('events', 'default')).toBe('eventsDefault');
    expect(barrelExportName('users', 'default')).toBe('usersDefault');
  });

  it('keeps non-reserved names as plain camelCase', () => {
    expect(barrelExportName('events', 'latest')).toBe('latest');
    expect(barrelExportName('orders', 'weekly_report')).toBe('weeklyReport');
  });
});

describe('buildMainExample', () => {
  it('produces a single-call template for one scaffolded query', () => {
    const out = buildMainExample([
      { tableName: 'events', queryName: 'default', requiredPartitions: [] },
    ]);
    expect(out).toContain(`import { createClient } from 'aathena';`);
    expect(out).toContain(`import { eventsDefault } from '../generated';`);
    expect(out).toContain(
      'const events = await eventsDefault(athena, { limit: 33 });',
    );
    expect(out).not.toContain('parallel');
  });

  it('produces a parallel() template for 2+ scaffolded queries', () => {
    const out = buildMainExample([
      { tableName: 'events', queryName: 'default', requiredPartitions: [] },
      { tableName: 'orders', queryName: 'default', requiredPartitions: [] },
    ]);
    expect(out).toContain(`import { createClient, parallel } from 'aathena';`);
    expect(out).toContain(`import { eventsDefault, ordersDefault } from '../generated';`);
    expect(out).toContain('const [events, orders] = await parallel(');
    expect(out).toContain(`() => eventsDefault(athena, { limit: 33 }),`);
    expect(out).toContain(`() => ordersDefault(athena, { limit: 33 }),`);
    expect(out).toContain(`{ concurrency: 'auto', client: athena }`);
  });

  it('always ends with a main().catch wrapper', () => {
    const out = buildMainExample([
      { tableName: 'events', queryName: 'default', requiredPartitions: [] },
    ]);
    expect(out).toMatch(/main\(\)\.catch\(/);
  });

  it('falls back to a client.query ping when no queries are scaffolded', () => {
    const out = buildMainExample([]);
    expect(out).toContain(`createClient`);
    expect(out).toContain(`SELECT 1 AS ping`);
  });

  it('passes REPLACE_ME placeholders alongside limit for tables with required partitions', () => {
    const out = buildMainExample([
      {
        tableName: 'events',
        queryName: 'default',
        requiredPartitions: [
          { name: 'tenant_id', type: 'string' },
          { name: 'dt', type: 'string' },
        ],
      },
    ]);
    expect(out).toContain(`Replace 'REPLACE_ME' with real values`);
    expect(out).toContain(
      `await eventsDefault(athena, { tenant_id: 'REPLACE_ME', dt: 'REPLACE_ME', limit: 33 });`,
    );
  });
});
