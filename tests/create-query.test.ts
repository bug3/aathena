import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQuery } from '../src/runtime/query';
import type { AathenaClient } from '../src/runtime/client';
import type { QueryResult } from '../src/runtime/types';

interface Params {
  status: string;
  rowLimit: number;
}

interface Row {
  event_id: number;
}

let tmpRoot: string;
let sqlPath: string;

function buildFakeClient(capturedSql: { value: string | null }): AathenaClient {
  return {
    query: async <T>(sql: string): Promise<QueryResult<T>> => {
      capturedSql.value = sql;
      return {
        rows: [] as T[],
        queryExecutionId: 'fake-exec',
        statistics: {
          engineExecutionTimeInMillis: 0,
          totalExecutionTimeInMillis: 0,
          queryQueueTimeInMillis: 0,
          queryPlanningTimeInMillis: 0,
          servicePreProcessingTimeInMillis: 0,
          serviceProcessingTimeInMillis: 0,
          dataScannedInBytes: 0,
        },
      };
    },
  } as unknown as AathenaClient;
}

beforeAll(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'aathena-exportto-'));
  sqlPath = join(tmpRoot, 'query.sql');
  writeFileSync(
    sqlPath,
    `SELECT * FROM events WHERE status = '{{status}}' LIMIT {{rowLimit}}`,
    'utf-8',
  );
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('createQuery exportTo', () => {
  it('forwards exportTo to sql-render and writes the rendered SQL', async () => {
    const captured = { value: null as string | null };
    const client = buildFakeClient(captured);
    const exportPath = join(tmpRoot, 'debug', 'rendered.sql');

    const run = createQuery<Row, Params>(sqlPath);
    await run(client, { status: 'active', rowLimit: 5 }, { exportTo: exportPath });

    expect(existsSync(exportPath)).toBe(true);
    const rendered = readFileSync(exportPath, 'utf-8');
    expect(rendered).toContain(`status = 'active'`);
    expect(rendered).toContain('LIMIT 5');

    // sql passed to the client must match the exported SQL byte-for-byte
    expect(captured.value).toBe(rendered);
  });

  it('creates missing parent directories under exportTo', async () => {
    const captured = { value: null as string | null };
    const client = buildFakeClient(captured);
    const exportPath = join(tmpRoot, 'nested', 'deeper', 'out.sql');

    const run = createQuery<Row, Params>(sqlPath);
    await run(client, { status: 'active', rowLimit: 1 }, { exportTo: exportPath });

    expect(existsSync(exportPath)).toBe(true);
  });

  it('does not write anything when exportTo is omitted', async () => {
    const captured = { value: null as string | null };
    const client = buildFakeClient(captured);
    const probe = join(tmpRoot, 'should-not-be-created.sql');

    // Guard: ensure parent exists but file does not
    mkdirSync(tmpRoot, { recursive: true });
    if (existsSync(probe)) rmSync(probe);

    const run = createQuery<Row, Params>(sqlPath);
    await run(client, { status: 'active', rowLimit: 3 });

    expect(existsSync(probe)).toBe(false);
    // Query still executes normally
    expect(captured.value).toContain('LIMIT 3');
  });
});
