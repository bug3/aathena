// Glue: order_id bigint, placed_at timestamp, tags array<varchar>,
// metadata map<string,int>, address struct<city:string>,
// items array<struct<qty:int>>, partitioned by dt string

import { createClient } from 'aathena';
import { detail } from './generated';

const athena = createClient();
const result = await detail(athena, { dt: '2026-08-26', rowLimit: 33 });
const row = result.rows[0];

row.order_id;        // bigint | null
row.placed_at;       // Date | null
row.tags;            // string[] | null
row.metadata;        // Record<string, number> | null
row.address?.city;   // string | undefined - struct field access
row.items?.[0].qty;  // number | undefined - nested array of struct
row.dt;              // string - partition keys are the only NOT NULL columns
