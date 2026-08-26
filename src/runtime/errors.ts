/**
 * Base class for everything aathena throws. Catch this to handle any aathena
 * failure without listing the subclasses:
 *
 * ```typescript
 * try {
 *   await byStatus(athena, { status: 'active', rowLimit: 99 });
 * } catch (err) {
 *   if (err instanceof AathenaError) console.log(err.name, err.message);
 *   else throw err;
 * }
 * ```
 */
export class AathenaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AathenaError';
  }
}

/**
 * The query did not reach a terminal state before `query.timeout` elapsed.
 * The execution may still be running in Athena; `queryExecutionId` is how you
 * look it up.
 */
export class QueryTimeoutError extends AathenaError {
  constructor(
    /** Athena's id for the execution that timed out. */
    public readonly queryExecutionId: string,
    /** The timeout that was exceeded, in ms. */
    public readonly timeoutMs: number,
  ) {
    super(`Query ${queryExecutionId} timed out after ${timeoutMs}ms`);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Athena reported the query as FAILED. `athenaErrorMessage` carries what the
 * service said, which is usually a SQL or permissions problem.
 */
export class QueryFailedError extends AathenaError {
  constructor(
    /** Athena's id for the failed execution. */
    public readonly queryExecutionId: string,
    /** The failure reason, verbatim from Athena. */
    public readonly athenaErrorMessage: string,
  ) {
    super(`Query ${queryExecutionId} failed: ${athenaErrorMessage}`);
    this.name = 'QueryFailedError';
  }
}

/** The execution was cancelled, either from the console or by another caller. */
export class QueryCancelledError extends AathenaError {
  constructor(
    /** Athena's id for the cancelled execution. */
    public readonly queryExecutionId: string,
  ) {
    super(`Query ${queryExecutionId} was cancelled`);
    this.name = 'QueryCancelledError';
  }
}

/**
 * A returned value did not parse as the type its column declares. This means
 * the generated types disagree with the data: usually the Glue schema changed
 * and `aathena generate` has not been run since.
 */
export class ColumnParseError extends AathenaError {
  constructor(
    /** The column that failed to parse. */
    public readonly column: string,
    /** The raw value Athena returned. */
    public readonly value: string,
    /** The type the generated code expected, for example `bigint`. */
    public readonly expectedType: string,
  ) {
    super(`Failed to parse column '${column}': expected ${expectedType}, got "${value}"`);
    this.name = 'ColumnParseError';
  }
}
