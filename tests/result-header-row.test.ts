import type { AthenaClient } from '@aws-sdk/client-athena';
import { describe, expect, it } from 'vitest';
import { executeQuery } from '../src/runtime/lifecycle';

// Athena puts the column names in the first result row of a DML query, but
// UTILITY statements (DESCRIBE, SHOW TABLES, SHOW COLUMNS) return data from
// the first row on. Verified live on 2026-09-28.
function fakeClient(statementType: string | undefined, values: string[]): AthenaClient {
  const send = async (command: object) => {
    switch (command.constructor.name) {
      case 'StartQueryExecutionCommand':
        return { QueryExecutionId: 'q-1' };
      case 'GetQueryExecutionCommand':
        return {
          QueryExecution: {
            Status: { State: 'SUCCEEDED' },
            StatementType: statementType,
            Statistics: {},
          },
        };
      case 'GetQueryResultsCommand':
        return {
          ResultSet: {
            ResultSetMetadata: { ColumnInfo: [{ Name: 'tab_name', Type: 'varchar' }] },
            Rows: values.map((v) => ({ Data: [{ VarCharValue: v }] })),
          },
        };
      default:
        throw new Error(`unexpected command ${command.constructor.name}`);
    }
  };
  return { send } as unknown as AthenaClient;
}

async function rowsFor(statementType: string | undefined, values: string[]) {
  const out = await executeQuery(fakeClient(statementType, values), 'SQL', 'db', undefined, undefined, {
    pollingInterval: 1,
  });
  return out.rows;
}

describe('result header row', () => {
  it('keeps the first row of a UTILITY result, which carries data', async () => {
    expect(await rowsFor('UTILITY', ['alb_external', 'black_box'])).toEqual([
      ['alb_external'],
      ['black_box'],
    ]);
  });

  it('drops the header row of a DML result', async () => {
    expect(await rowsFor('DML', ['tab_name', 'black_box'])).toEqual([['black_box']]);
  });

  it('keeps the header skip when Athena reports no statement type', async () => {
    expect(await rowsFor(undefined, ['tab_name', 'black_box'])).toEqual([['black_box']]);
  });
});
