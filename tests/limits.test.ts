import { describe, it, expect } from 'vitest';
import {
  getDocumentedDefault,
  getConservativeFallback,
} from '../src/runtime/limits';

describe('getDocumentedDefault', () => {
  it('returns 200 for us-east-1 DML (Tier 1)', () => {
    expect(getDocumentedDefault('us-east-1', 'dml')).toBe(200);
  });

  it('returns 150 for Tier 2 regions', () => {
    for (const r of ['us-east-2', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-northeast-1']) {
      expect(getDocumentedDefault(r, 'dml')).toBe(150);
    }
  });

  it('returns 100 for Tier 3 regions', () => {
    for (const r of ['ap-south-1', 'ap-northeast-2', 'ap-southeast-1', 'ap-southeast-2', 'eu-west-2']) {
      expect(getDocumentedDefault(r, 'dml')).toBe(100);
    }
  });

  it('returns 20 for Tier 4 (unknown / low-tier) regions', () => {
    for (const r of ['us-west-1', 'sa-east-1', 'af-south-1', 'me-central-1', 'ca-west-1', 'ap-southeast-7']) {
      expect(getDocumentedDefault(r, 'dml')).toBe(20);
    }
  });

  it('returns 20 for DDL in every region', () => {
    for (const r of ['us-east-1', 'eu-west-1', 'sa-east-1', 'made-up-region']) {
      expect(getDocumentedDefault(r, 'ddl')).toBe(20);
    }
  });
});

describe('getConservativeFallback', () => {
  it('clamps to 25 even for Tier 1 us-east-1', () => {
    // 200 * 0.5 = 100, clamped to 25
    expect(getConservativeFallback('us-east-1', 'dml')).toBe(25);
  });

  it('clamps to 25 for Tier 2 (150/2 = 75)', () => {
    expect(getConservativeFallback('eu-west-1', 'dml')).toBe(25);
  });

  it('clamps to 25 for Tier 3 (100/2 = 50)', () => {
    expect(getConservativeFallback('eu-west-2', 'dml')).toBe(25);
  });

  it('returns floor-min 10 for Tier 4 (20/2 = 10)', () => {
    expect(getConservativeFallback('sa-east-1', 'dml')).toBe(10);
  });

  it('returns 10 for DDL everywhere (20/2 = 10)', () => {
    expect(getConservativeFallback('us-east-1', 'ddl')).toBe(10);
    expect(getConservativeFallback('made-up', 'ddl')).toBe(10);
  });
});
