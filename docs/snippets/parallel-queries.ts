import { createClient, parallel } from 'aathena';
import { active, byStatus } from './generated';

const athena = createClient();

// Tasks are thunks, not promises, so parallel() decides when each query
// actually starts rather than racing them all at import time.
const [users, events] = await parallel(
  [
    () => active(athena, { minAge: 18, rowLimit: 99 }),
    () => byStatus(athena, { status: 'active', rowLimit: 99 }),
  ],
  { concurrency: 'auto', client: athena },
);
