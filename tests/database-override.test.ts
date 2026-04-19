import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/runtime/lifecycle', () => ({
  executeQuery: vi.fn(async () => ({
    queryExecutionId: 'qid',
    columns: [],
    rows: [],
    statistics: {
      engineExecutionTimeInMillis: 0,
      totalExecutionTimeInMillis: 0,
      queryQueueTimeInMillis: 0,
      queryPlanningTimeInMillis: 0,
      servicePreProcessingTimeInMillis: 0,
      serviceProcessingTimeInMillis: 0,
      dataScannedInBytes: 0,
    },
  })),
}));

const { AathenaClient } = await import('../src/runtime/client');
const lifecycle = await import('../src/runtime/lifecycle');
const executeQueryMock = vi.mocked(lifecycle.executeQuery);

describe('client.query database override', () => {
  beforeEach(() => {
    executeQueryMock.mockClear();
  });

  it('falls back to config.database when no option is given', async () => {
    const client = new AathenaClient({ database: 'primary_db', region: 'us-east-1' });
    await client.query('SELECT 1');
    const call = executeQueryMock.mock.calls[0];
    expect(call[2]).toBe('primary_db'); // database arg position
  });

  it('uses options.database when set', async () => {
    const client = new AathenaClient({ database: 'primary_db', region: 'us-east-1' });
    await client.query('SELECT 1', { database: 'other_db' });
    const call = executeQueryMock.mock.calls[0];
    expect(call[2]).toBe('other_db');
  });

  it('options.database does not mutate config', async () => {
    const client = new AathenaClient({ database: 'primary_db', region: 'us-east-1' });
    await client.query('SELECT 1', { database: 'other_db' });
    await client.query('SELECT 2');
    expect(executeQueryMock.mock.calls[0][2]).toBe('other_db');
    expect(executeQueryMock.mock.calls[1][2]).toBe('primary_db');
  });
});
