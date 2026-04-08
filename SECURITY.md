# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it privately via [GitHub Security Advisories](https://github.com/bug3/aathena/security/advisories/new).

Do not open a public issue for security vulnerabilities.

You can expect an initial response within 48 hours. Critical fixes will be released as a patch version as soon as possible.

## Security Considerations

### SQL Injection

aathena uses [sql-render](https://github.com/bug3/sql-render) for template rendering, which includes built-in SQL injection protection for `{{variable}}` placeholders. The `@param string` type validates inputs against common injection patterns.

For maximum safety, prefer `@param` annotations with specific types (`enum`, `positiveInt`, `isoDate`, etc.) over relying on inference alone.

### AWS Credentials

aathena does not store or manage AWS credentials. It relies on the standard AWS SDK credential chain (environment variables, IAM roles, SSO, etc.). Never commit credentials or `aathena.config.json` files containing sensitive values to version control.

### Query Results

Athena query results are stored in the S3 `outputLocation` you configure. Ensure this bucket has appropriate access policies and encryption settings for your data classification.
