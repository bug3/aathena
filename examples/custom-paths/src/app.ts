/**
 * Example: custom tablesDir and outDir paths.
 *
 * When tablesDir/outDir are nested under src/, aathena resolves SQL files
 * relative to the project root (where aathena.config.json lives).
 *
 * Config:
 *   "tablesDir": "src/aws/athena/tables"
 *   "outDir":    "src/aws/athena/generated"
 */

import { createClient } from 'aathena';
import { topPages } from './aws/athena/generated';

const athena = createClient();

const result = await topPages(athena, {
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  limit: 20,
});

for (const row of result.rows) {
  console.log(row.page_url);    // string | null
  console.log(row.view_count);  // number
  console.log(row.created_at);  // Date | null
}
