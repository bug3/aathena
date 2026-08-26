import { createClient } from 'aathena';

// createClient() with no argument reads aathena.config.json from the project
// root. Pass a config to override it - useful in tests, or when the project
// root is not on disk (bundled Lambda deploys).
const athena = createClient({
  region: 'us-east-1',
  database: 'analytics',
  workgroup: 'primary',
  outputLocation: 's3://my-athena-results/output/',
});
