import { createClient } from 'aathena';
import { byStatus } from './generated';

const athena = createClient();
const result = await byStatus(athena, { status: 'active', rowLimit: 99 });
