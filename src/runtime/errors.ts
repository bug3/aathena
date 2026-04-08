export class AathenaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AathenaError';
  }
}

export class QueryTimeoutError extends AathenaError {
  constructor(
    public readonly queryExecutionId: string,
    public readonly timeoutMs: number,
  ) {
    super(`Query ${queryExecutionId} timed out after ${timeoutMs}ms`);
    this.name = 'QueryTimeoutError';
  }
}

export class QueryFailedError extends AathenaError {
  constructor(
    public readonly queryExecutionId: string,
    public readonly athenaErrorMessage: string,
  ) {
    super(`Query ${queryExecutionId} failed: ${athenaErrorMessage}`);
    this.name = 'QueryFailedError';
  }
}

export class QueryCancelledError extends AathenaError {
  constructor(public readonly queryExecutionId: string) {
    super(`Query ${queryExecutionId} was cancelled`);
    this.name = 'QueryCancelledError';
  }
}

export class ColumnParseError extends AathenaError {
  constructor(
    public readonly column: string,
    public readonly value: string,
    public readonly expectedType: string,
  ) {
    super(`Failed to parse column '${column}': expected ${expectedType}, got "${value}"`);
    this.name = 'ColumnParseError';
  }
}
