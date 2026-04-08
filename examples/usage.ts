/**
 * Example: how to use aathena-generated query functions.
 *
 * After running `npx aathena generate`, the generated/ directory contains
 * typed query functions you can import and call directly.
 *
 * This file won't compile as-is (generated/ doesn't exist in the repo),
 * but it shows the API you get after codegen.
 */

import { createClient, QueryTimeoutError, QueryFailedError } from 'aathena';

// Import generated query functions (created by `npx aathena generate`)
import { byStatus, byDateRange, totalRevenue } from './generated';

const athena = createClient({
  database: 'sampledb',
  outputLocation: 's3://my-athena-results/output/',
});

// --- Basic query with inferred types ---

const events = await byStatus(athena, {
  status: 'active',  // string (inferred from quoted context)
  limit: 50,         // number (inferred from LIMIT)
});

for (const row of events.rows) {
  console.log(row.event_id);    // number
  console.log(row.event_name);  // string
  console.log(row.price);       // string (decimal → precision safe)
  console.log(row.created_at);  // Date
}

// --- Query with @param validation ---

const filtered = await byDateRange(athena, {
  status: 'active',             // only 'active' | 'pending' | 'done'
  startDate: '2025-01-01',     // validated as YYYY-MM-DD at runtime
  endDate: '2025-12-31',       // validated as YYYY-MM-DD at runtime
  limit: 100,                  // validated as positive integer at runtime
});

console.log(`Found ${filtered.rows.length} events`);

// --- Query with no parameters ---

const revenue = await totalRevenue(athena, {});

for (const row of revenue.rows) {
  console.log(`${row.day}: ${row.total_revenue}`);
}

// --- Error handling ---

try {
  await byStatus(athena, { status: 'active', limit: 10 });
} catch (err) {
  if (err instanceof QueryTimeoutError) {
    console.error(`Query timed out after ${err.timeoutMs}ms`);
  }
  if (err instanceof QueryFailedError) {
    console.error(`Athena error: ${err.athenaErrorMessage}`);
  }
}

// --- Query statistics ---

console.log(events.queryExecutionId);                    // Athena execution ID
console.log(events.statistics?.dataScannedInBytes);      // bytes scanned
console.log(events.statistics?.engineExecutionTimeInMillis); // execution time
