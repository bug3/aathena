import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path of the skill file shipped inside the package.
 *
 * Two levels up is the package root from `dist/cli/` in an installed copy and
 * the repository root from `src/cli/` when running the tests, so the same
 * relative path is correct in both.
 */
export function skillSourcePath(): string {
  return resolve(HERE, '..', '..', 'skills', 'aathena', 'SKILL.md');
}

/**
 * Directory that every agent using the vendor-neutral convention reads.
 *
 * Measured on 2026-08-27 with `gh skill install --agent <name> --scope project`
 * across nine agents: codex, cursor, github-copilot, gemini-cli, opencode and
 * the `universal` target all resolve here; claude-code resolves to
 * `.claude/skills`; grok and devin use their own vendor directories.
 *
 * That long tail is deliberately not mirrored. `gh skill` owns the mapping for
 * roughly forty-five agents and it changes, so a second copy here would rot.
 * Callers point those users at `gh skill install bug3/aathena` instead.
 */
const NEUTRAL_DIR = '.agents/skills';

/** Written in addition to the neutral directory when its marker already exists. */
const CLAUDE = { marker: '.claude', dir: '.claude/skills' };

/** What writing the skill did to one target. */
export type SkillOutcome = 'written' | 'updated' | 'current';

/** One materialized skill file and what happened to it. */
export interface SkillTarget {
  /** Path of the skill file, relative to the project root. */
  path: string;
  /** Whether the file was created, replaced, or already correct. */
  outcome: SkillOutcome;
}

/**
 * Skill file paths to write for a project, relative to its root.
 *
 * The neutral directory is always included. The Claude Code directory is added
 * only when the project already has a `.claude` directory, so a project that
 * does not use it is not given one.
 */
export function skillTargets(cwd: string): string[] {
  const targets = [join(NEUTRAL_DIR, 'aathena', 'SKILL.md')];
  if (existsSync(resolve(cwd, CLAUDE.marker))) {
    targets.push(join(CLAUDE.dir, 'aathena', 'SKILL.md'));
  }
  return targets;
}

/**
 * Write `contents` to every skill target under `cwd`.
 *
 * Idempotent: a target already holding exactly these bytes is left alone and
 * reported as `current`. A target holding anything else is replaced rather than
 * merged, because the file is generated content owned by the package.
 */
export function writeSkill(cwd: string, contents: string): SkillTarget[] {
  return skillTargets(cwd).map((rel) => {
    const abs = resolve(cwd, rel);
    const existed = existsSync(abs);
    if (existed && readFileSync(abs, 'utf-8') === contents) {
      return { path: rel, outcome: 'current' as const };
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf-8');
    return { path: rel, outcome: existed ? ('updated' as const) : ('written' as const) };
  });
}

/**
 * Copy the packaged skill into the project's agent directories.
 *
 * @throws {Error} when the package was installed without its `skills/`
 *   directory, which is a packaging fault rather than a user error.
 */
export function materializeSkill(cwd: string): SkillTarget[] {
  const source = skillSourcePath();
  if (!existsSync(source)) {
    throw new Error(
      `the installed aathena package has no skills/aathena/SKILL.md (looked in ${source})`,
    );
  }
  return writeSkill(cwd, readFileSync(source, 'utf-8'));
}
