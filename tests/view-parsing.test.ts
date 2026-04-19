import { describe, it, expect } from 'vitest';
import {
  extractViewReferences,
  findTableRefsInSql,
} from '../src/cli/aws-discovery';

describe('findTableRefsInSql', () => {
  it('finds a two-part FROM ref', () => {
    expect(
      findTableRefsInSql('SELECT * FROM sales.orders LIMIT 10', 'defaultdb'),
    ).toEqual([{ database: 'sales', tableName: 'orders' }]);
  });

  it('defaults the database for bare FROM refs', () => {
    expect(findTableRefsInSql('SELECT * FROM orders', 'defaultdb')).toEqual([
      { database: 'defaultdb', tableName: 'orders' },
    ]);
  });

  it('drops the catalog in a three-part ref', () => {
    expect(
      findTableRefsInSql(
        'SELECT * FROM awsdatacatalog.sales.orders',
        'defaultdb',
      ),
    ).toEqual([{ database: 'sales', tableName: 'orders' }]);
  });

  it('captures JOIN refs alongside FROM', () => {
    const refs = findTableRefsInSql(
      'SELECT * FROM sales.orders o JOIN sales.users u ON o.uid = u.id',
      'defaultdb',
    );
    expect(refs).toEqual([
      { database: 'sales', tableName: 'orders' },
      { database: 'sales', tableName: 'users' },
    ]);
  });

  it('dedupes repeated refs', () => {
    const refs = findTableRefsInSql(
      'SELECT a.x FROM sales.orders a JOIN sales.orders b ON a.id = b.id',
      'defaultdb',
    );
    expect(refs).toEqual([{ database: 'sales', tableName: 'orders' }]);
  });

  it('unquotes double-quoted identifiers', () => {
    expect(
      findTableRefsInSql('SELECT * FROM "my-db"."my-table"', 'defaultdb'),
    ).toEqual([{ database: 'my-db', tableName: 'my-table' }]);
  });

  it('ignores FROM inside line comments', () => {
    expect(
      findTableRefsInSql(
        '-- FROM sales.fake\nSELECT * FROM sales.real',
        'defaultdb',
      ),
    ).toEqual([{ database: 'sales', tableName: 'real' }]);
  });

  it('ignores FROM inside block comments', () => {
    expect(
      findTableRefsInSql(
        '/* FROM sales.fake */ SELECT * FROM sales.real',
        'defaultdb',
      ),
    ).toEqual([{ database: 'sales', tableName: 'real' }]);
  });

  it('ignores FROM inside string literals', () => {
    expect(
      findTableRefsInSql(
        `SELECT 'FROM sales.fake' AS note FROM sales.real`,
        'defaultdb',
      ),
    ).toEqual([{ database: 'sales', tableName: 'real' }]);
  });

  it('handles CTE with nested FROM', () => {
    const refs = findTableRefsInSql(
      'WITH t AS (SELECT * FROM sales.orders) SELECT * FROM t JOIN sales.users u ON 1=1',
      'defaultdb',
    );
    expect(refs).toEqual([
      { database: 'sales', tableName: 'orders' },
      // 't' looks like a bare ref -> defaultdb.t, which is a harmless
      // false positive; the downstream probe would return no partitions
      // for non-existent tables.
      { database: 'defaultdb', tableName: 't' },
      { database: 'sales', tableName: 'users' },
    ]);
  });
});

describe('extractViewReferences', () => {
  it('returns [] for empty input', () => {
    expect(extractViewReferences(undefined, 'db')).toEqual([]);
    expect(extractViewReferences('', 'db')).toEqual([]);
  });

  it('decodes a Presto-view base64 marker and parses its originalSql', () => {
    const payload = Buffer.from(
      JSON.stringify({
        originalSql: 'SELECT tenant_id FROM analytics.events_raw',
      }),
    ).toString('base64');
    const viewText = `/* Presto View: ${payload} */`;
    expect(extractViewReferences(viewText, 'analytics')).toEqual([
      { database: 'analytics', tableName: 'events_raw' },
    ]);
  });

  it('falls back to scanning raw text when the marker is missing', () => {
    const viewText = `CREATE VIEW v AS SELECT * FROM sales.orders`;
    expect(extractViewReferences(viewText, 'defaultdb')).toEqual([
      { database: 'sales', tableName: 'orders' },
    ]);
  });

  it('falls back to raw scan when the base64 payload is corrupt', () => {
    // Non-base64 garbage inside the marker: should not throw, fall through.
    const viewText = `/* Presto View: !!!not-valid-base64!!! */ CREATE VIEW v AS SELECT * FROM sales.orders`;
    expect(extractViewReferences(viewText, 'defaultdb')).toEqual([
      { database: 'sales', tableName: 'orders' },
    ]);
  });
});
