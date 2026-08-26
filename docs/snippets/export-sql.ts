import { createClient } from 'aathena';
import { byStatus } from './generated';

const athena = createClient();

// The rendered SQL, with parameter values substituted, is written to disk.
// The query still runs; missing parent directories are created and the file
// is overwritten on each call.
await byStatus(
  athena,
  { status: 'active', rowLimit: 99 },
  { exportTo: './debug/by-status.sql' },
);
