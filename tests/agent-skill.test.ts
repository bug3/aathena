import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  materializeSkill,
  skillSourcePath,
  skillTargets,
  writeSkill,
} from '../src/cli/agent-skill';

const NEUTRAL = join('.agents', 'skills', 'aathena', 'SKILL.md');
const CLAUDE = join('.claude', 'skills', 'aathena', 'SKILL.md');

let project: string;

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'aathena-skill-'));
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe('skillTargets', () => {
  it('always writes the vendor-neutral directory', () => {
    expect(skillTargets(project)).toEqual([NEUTRAL]);
  });

  it('adds the Claude Code directory only when the project already has one', () => {
    mkdirSync(join(project, '.claude'), { recursive: true });
    expect(skillTargets(project)).toEqual([NEUTRAL, CLAUDE]);
  });
});

describe('writeSkill', () => {
  it('creates the file and reports it as written', () => {
    const result = writeSkill(project, 'skill body\n');

    expect(result).toEqual([{ path: NEUTRAL, outcome: 'written' }]);
    expect(readFileSync(join(project, NEUTRAL), 'utf-8')).toBe('skill body\n');
  });

  it('is idempotent: an unchanged second run reports current and rewrites nothing', () => {
    writeSkill(project, 'skill body\n');
    const again = writeSkill(project, 'skill body\n');

    expect(again).toEqual([{ path: NEUTRAL, outcome: 'current' }]);
  });

  it('replaces a stale file rather than merging it', () => {
    writeSkill(project, 'old body\n');
    const result = writeSkill(project, 'new body\n');

    expect(result).toEqual([{ path: NEUTRAL, outcome: 'updated' }]);
    expect(readFileSync(join(project, NEUTRAL), 'utf-8')).toBe('new body\n');
  });

  it('writes both directories when .claude exists', () => {
    mkdirSync(join(project, '.claude'), { recursive: true });
    writeSkill(project, 'skill body\n');

    expect(existsSync(join(project, NEUTRAL))).toBe(true);
    expect(existsSync(join(project, CLAUDE))).toBe(true);
  });

  it('does not create a .claude directory for a project that has none', () => {
    writeSkill(project, 'skill body\n');

    expect(existsSync(join(project, '.claude'))).toBe(false);
  });
});

describe('materializeSkill', () => {
  // Binds the CLI to the shipped file. `skillSourcePath` resolves two levels up
  // from this module, which is the repository root here and the installed
  // package root in dist/. If the layout or the packaged `files` list ever drops
  // skills/, this fails rather than shipping a command that cannot work.
  it('copies the skill that this repository publishes', () => {
    const published = resolve(__dirname, '..', 'skills', 'aathena', 'SKILL.md');
    expect(skillSourcePath()).toBe(published);

    const result = materializeSkill(project);

    expect(result).toEqual([{ path: NEUTRAL, outcome: 'written' }]);
    expect(readFileSync(join(project, NEUTRAL), 'utf-8')).toBe(
      readFileSync(published, 'utf-8'),
    );
  });

  it('replaces a prior copy that differs', () => {
    mkdirSync(join(project, '.agents', 'skills', 'aathena'), { recursive: true });
    writeFileSync(join(project, NEUTRAL), 'an older version\n', 'utf-8');

    expect(materializeSkill(project)).toEqual([{ path: NEUTRAL, outcome: 'updated' }]);
  });
});
