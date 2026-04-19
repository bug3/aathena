import { describe, it, expect } from 'vitest';
import { parseArgs, flagString, flagBool } from '../src/cli/args';

describe('parseArgs', () => {
  it('separates positional and flag args', () => {
    const r = parseArgs(['init', '--region', 'us-east-1', '--force']);
    expect(r.positional).toEqual(['init']);
    expect(r.flags.region).toBe('us-east-1');
    expect(r.flags.force).toBe(true);
  });

  it('supports --key=value form', () => {
    const r = parseArgs(['--database=sales', '--region=us-west-2']);
    expect(r.flags.database).toBe('sales');
    expect(r.flags.region).toBe('us-west-2');
  });

  it('treats --no-foo as false', () => {
    const r = parseArgs(['add', '--no-generate', '--no-sample']);
    expect(r.flags.generate).toBe(false);
    expect(r.flags.sample).toBe(false);
  });

  it('handles a bare --flag at the end', () => {
    const r = parseArgs(['--force']);
    expect(r.flags.force).toBe(true);
  });

  it('collects multiple positional args', () => {
    const r = parseArgs(['add', 'sales.events', '--name', 'daily']);
    expect(r.positional).toEqual(['add', 'sales.events']);
    expect(r.flags.name).toBe('daily');
  });
});

describe('flagString / flagBool', () => {
  it('coerces safely when type mismatches', () => {
    expect(flagString({ force: true }, 'force')).toBeUndefined();
    expect(flagBool({ region: 'us-east-1' }, 'region')).toBeUndefined();
    expect(flagString({ region: 'us-east-1' }, 'region')).toBe('us-east-1');
    expect(flagBool({ force: true }, 'force')).toBe(true);
    expect(flagBool({ sample: false }, 'sample')).toBe(false);
  });
});
