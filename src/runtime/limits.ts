/**
 * Athena concurrent query quotas.
 *
 * Athena enforces two service quotas, per-account per-region:
 *   - Active DML queries (L-D405C694) - SELECT, CTAS, INSERT INTO
 *   - Active DDL queries (L-FCDFE414) - CREATE TABLE, ALTER TABLE ADD PARTITION
 *
 * Both are adjustable in the Service Quotas console. Defaults vary by region.
 * Values here reflect the AWS-documented defaults as of 2026-04-19, sourced
 * from https://docs.aws.amazon.com/general/latest/gr/athena.html.
 */

export type QuotaKind = 'dml' | 'ddl';

const DML_DEFAULT_BY_REGION: Record<string, number> = {
  // Tier 1: 200
  'us-east-1': 200,
  // Tier 2: 150
  'us-east-2': 150,
  'us-west-2': 150,
  'eu-west-1': 150,
  'eu-central-1': 150,
  'ap-northeast-1': 150,
  // Tier 3: 100
  'ap-south-1': 100,
  'ap-northeast-2': 100,
  'ap-southeast-1': 100,
  'ap-southeast-2': 100,
  'eu-west-2': 100,
  // All other regions (us-west-1, ca-*, sa-*, af-*, me-*, il-*, mx-*,
  // eu-north-1, eu-south-*, eu-west-3, eu-central-2, ap-east-*, ap-south-2,
  // ap-northeast-3, ap-southeast-3..7, GovCloud) default to 20.
};

const UNKNOWN_REGION_DML_DEFAULT = 20;
const DDL_DEFAULT = 20;

/**
 * AWS-documented default quota for this region and kind. Returns the value
 * AWS publishes for fresh accounts - not the account's current quota.
 */
export function getDocumentedDefault(region: string, kind: QuotaKind): number {
  if (kind === 'ddl') return DDL_DEFAULT;
  return DML_DEFAULT_BY_REGION[region] ?? UNKNOWN_REGION_DML_DEFAULT;
}

/**
 * Conservative fallback used when the live service-quotas lookup fails
 * (no IAM permission, offline, throttled, etc). Applies a 50% safety margin
 * against the documented default, clamped to [5, 25]. This keeps the cap
 * well below AWS defaults even if the account has reduced quotas, while
 * staying well above 1 for regions with the lowest (20) default.
 */
export function getConservativeFallback(region: string, kind: QuotaKind): number {
  const base = getDocumentedDefault(region, kind);
  const halved = Math.floor(base * 0.5);
  return Math.max(5, Math.min(25, halved));
}

interface CacheEntry {
  value: number;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const quotaCache = new Map<string, CacheEntry>();

/** Test hook. Not part of the public API. */
export function _clearQuotaCache(): void {
  quotaCache.clear();
}

/**
 * Fetch the live service quota for this account+region via Service Quotas.
 *
 * The @aws-sdk/client-service-quotas dependency is optional - if not
 * installed, the fetch fails fast and the caller falls back to
 * getConservativeFallback. Loaded via dynamic import so bundles that never
 * call this don't pay for it.
 */
export async function fetchLiveQuota(
  region: string,
  kind: QuotaKind,
): Promise<number> {
  const cacheKey = `${region}:${kind}`;
  const cached = quotaCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const quotaCode = kind === 'dml' ? 'L-D405C694' : 'L-FCDFE414';

  let mod: typeof import('@aws-sdk/client-service-quotas');
  try {
    mod = await import('@aws-sdk/client-service-quotas');
  } catch {
    throw new Error(
      "@aws-sdk/client-service-quotas is not installed. Install it, or pass " +
        "{ concurrency: <number> } / set 'maxConcurrency' in aathena.config.json.",
    );
  }

  const { ServiceQuotasClient, GetServiceQuotaCommand } = mod;
  const client = new ServiceQuotasClient({ region });
  const res = await client.send(
    new GetServiceQuotaCommand({
      ServiceCode: 'athena',
      QuotaCode: quotaCode,
    }),
  );

  const value = res.Quota?.Value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Service Quotas returned no value for ${quotaCode} in ${region}`,
    );
  }

  const rounded = Math.floor(value);
  quotaCache.set(cacheKey, { value: rounded, fetchedAt: Date.now() });
  return rounded;
}
