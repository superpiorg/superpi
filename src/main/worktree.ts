import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import simpleGit from 'simple-git'
import { WORKTREE_SUBDIR } from './paths'

export interface WorktreeInfo {
  worktreePath: string
  branch: string
}

/**
 * Creates and removes git worktrees *inside* the open workspace, under
 * `<workspace>/.superpi/<id>`. Each worktree gets a dedicated branch so
 * parallel agents never collide.
 */
export class WorktreeManager {
  async create(
    repoPath: string,
    id: string,
    baseBranch?: string
  ): Promise<WorktreeInfo> {
    const git = simpleGit(repoPath)
    if (!(await git.checkIsRepo())) {
      throw new Error(`Not a git repository: ${repoPath}`)
    }
    await ensureBaseCommit(repoPath)

    const worktreePath = join(repoPath, WORKTREE_SUBDIR, id)
    const branch = `superpi/${id.slice(0, 8)}`
    const start = baseBranch ?? 'HEAD'

    // Keep the worktree dir and the node_modules symlink out of git.
    await ensureExcluded(repoPath, `${WORKTREE_SUBDIR}/`)
    await ensureExcluded(repoPath, 'node_modules')

    mkdirSync(join(repoPath, WORKTREE_SUBDIR), { recursive: true })
    // -b <branch> <path> <start>: new branch at <start>, checked out in the worktree.
    await git.raw(['worktree', 'add', '-b', branch, worktreePath, start])
    return { worktreePath, branch }
  }

  async remove(repoPath: string, worktreePath: string, branch?: string): Promise<void> {
    const git = simpleGit(repoPath)
    try {
      await git.raw(['worktree', 'remove', '--force', worktreePath])
    } catch {
      /* worktree already gone */
    }
    // Clean up the worktree directory. Never delete the repo itself.
    if (resolve(worktreePath) !== resolve(repoPath)) {
      try { rmSync(worktreePath, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    if (branch) {
      try {
        await git.raw(['branch', '-D', branch])
      } catch {
        /* branch may not exist */
      }
    }
  }
}

/**
 * A freshly `git init`'d repo has an unborn HEAD (no commits), so
 * `worktree add … HEAD` fails. Seed an empty base commit when needed,
 * configuring a local identity only if none is set.
 */
async function ensureBaseCommit(repoPath: string): Promise<void> {
  const git = simpleGit(repoPath)
  const refs = await git.raw(['rev-list', '-n', '1', '--all'])
  if (refs.trim()) return
  let email = ''
  let name = ''
  try {
    email = (await git.raw(['config', '--get', 'user.email'])).trim()
  } catch {
    /* unset */
  }
  try {
    name = (await git.raw(['config', '--get', 'user.name'])).trim()
  } catch {
    /* unset */
  }
  if (!email) await git.raw(['config', 'user.email', 'superpi@local'])
  if (!name) await git.raw(['config', 'user.name', 'superpi'])
  await git.raw(['commit', '--allow-empty', '-q', '-m', 'superpi init'])
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  )
}

/** Append <pattern> to the repo's local exclude (not committed). */
async function ensureExcluded(repoPath: string, pattern: string): Promise<void> {
  const excludePath = join(repoPath, '.git', 'info', 'exclude')
  let existing = ''
  try {
    existing = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : ''
  } catch {
    existing = ''
  }
  if (!existing.split('\n').some((l) => l.trim() === pattern)) {
    mkdirSync(join(repoPath, '.git', 'info'), { recursive: true })
    const next = existing.endsWith('\n') || existing === '' ? existing : existing + '\n'
    writeFileSync(excludePath, next + pattern + '\n')
  }
}

/**
 * Make a fresh worktree instantly usable by linking the workspace's
 * node_modules into it (so typecheck/build/test work without `npm install`).
 * No-op if the workspace has no node_modules or the worktree already has one.
 */
export function linkNodeModules(workspacePath: string, worktreePath: string): void {
  const source = join(resolve(workspacePath), 'node_modules')
  const target = join(worktreePath, 'node_modules')
  if (!existsSync(source)) return
  try {
    lstatSync(target) // present (file/dir/symlink) — don't clobber
    return
  } catch {
    /* not present — create the link below */
  }
  try {
    symlinkSync(source, target, 'dir')
  } catch {
    /* unsupported platform / permissions — agent falls back to npm install */
  }
}
