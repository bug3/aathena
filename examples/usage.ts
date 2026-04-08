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
import { byStatus, byDateRange, totalRevenue, byCategory } from './generated';

// No config needed - reads from aathena.config.json automatically
const athena = createClient();

// --- Basic query with inferred types ---

const events = await byStatus(athena, {
  status: 'active',  // string (inferred from quoted context)
  limit: 50,         // number (inferred from LIMIT)
});

for (const row of events.rows) {
  console.log(row.event_id);    // number
  console.log(row.event_name);  // string | null
  console.log(row.price);       // string | null (decimal → precision safe)
  console.log(row.created_at);  // Date | null
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
  console.log(`${row.event_name}: ${row.price}`);
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

// --- Complex types (array, map, struct) ---
// Athena returns complex types as flat strings.
// aathena parses them automatically, you get real arrays, records, and objects.

const products = await byCategory(athena, {
  category: 'electronics',
  limit: 10,
});

for (const row of products.rows) {
  console.log(row.product_id);   // number
  console.log(row.name);         // string | null

  // array<varchar> → string[]
  console.log(row.tags);                // string[] | null
  console.log(row.tags?.[0]);           // string

  // map<string,string> → Record<string, string>
  console.log(row.attributes);          // Record<string, string> | null
  console.log(row.attributes?.['color']); // string

  // struct<city:string,zip:integer,country:string> → typed object
  console.log(row.shipping_address);           // { city: string; zip: number; country: string } | null
  console.log(row.shipping_address?.city);     // string
  console.log(row.shipping_address?.zip);      // number
  console.log(row.shipping_address?.country);  // string
}

// --- Query statistics ---

console.log(events.queryExecutionId);                    // Athena execution ID
console.log(events.statistics?.dataScannedInBytes);      // bytes scanned
console.log(events.statistics?.engineExecutionTimeInMillis); // execution time
