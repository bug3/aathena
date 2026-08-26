import {
  AathenaError,
  QueryFailedError,
  QueryTimeoutError,
  createClient,
} from 'aathena';
import { byStatus } from './generated';

const athena = createClient();

try {
  const result = await byStatus(athena, { status: 'active', rowLimit: 99 });
  console.log(result.rows.length);
} catch (err) {
  if (err instanceof QueryTimeoutError) {
    console.log(`Timed out after ${err.timeoutMs}ms: ${err.queryExecutionId}`);
  } else if (err instanceof QueryFailedError) {
    console.log(`Athena error: ${err.athenaErrorMessage}`);
  } else if (err instanceof AathenaError) {
    // QueryCancelledError, ColumnParseError, or anything else aathena threw
    console.log(`aathena error (${err.name}): ${err.message}`);
  } else {
    throw err;
  }
}
