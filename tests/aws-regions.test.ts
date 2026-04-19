import { describe, it, expect } from 'vitest';
import { AWS_REGIONS, CUSTOM_REGION_SENTINEL } from '../src/cli/aws-regions';

describe('AWS_REGIONS', () => {
  it('includes the common commercial regions', () => {
    const codes = AWS_REGIONS.map((r) => r.code);
    for (const code of ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1', 'sa-east-1']) {
      expect(codes).toContain(code);
    }
  });

  it('has unique region codes', () => {
    const codes = AWS_REGIONS.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('gives every region a non-empty human-readable label', () => {
    for (const r of AWS_REGIONS) {
      expect(r.label.length).toBeGreaterThan(0);
    }
  });

  it('is sorted alphabetically by code so the select list is predictable', () => {
    const codes = AWS_REGIONS.map((r) => r.code);
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });

  it('does not collide with CUSTOM_REGION_SENTINEL', () => {
    const codes = AWS_REGIONS.map((r) => r.code);
    expect(codes).not.toContain(CUSTOM_REGION_SENTINEL);
  });

  it('uses a sentinel that is not a valid region code (prefixed with underscores)', () => {
    // Prevents accidental collision with a future real region.
    expect(CUSTOM_REGION_SENTINEL.startsWith('__')).toBe(true);
  });
});
