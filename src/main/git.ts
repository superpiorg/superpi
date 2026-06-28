import simpleGit from 'simple-git'
import type { GitLogEntry, WorktreeCommit, WorktreeDiffStat, WorktreeGraph } from '@shared/types'


/** True if <path> is inside a git working tree. */
export async function checkIsRepo(path: string): Promise<boolean> {
  try {
    return await simpleGit(path).checkIsRepo()
  } catch {
    return false
  }
}

/** `git init` a folder and seed an initial empty commit so worktrees have a base. */
export async function initRepo(path: string): Promise<void> {
  const git = simpleGit(path)
  await git.init()
  try {
    await git.raw(['config', 'user.email', 'superpi@local'])
  } catch {
    /* may already be set globally */
  }
  try {
    await git.raw(['config', 'user.name', 'superpi'])
  } catch {
    /* may already be set globally */
  }
  // An initial commit is required: git worktree add -b needs a real start ref.
  await git.raw(['commit', '--allow-empty', '-q', '-m', 'superpi init'])
}

/** Return recent commits from the workspace repo for the git log panel. */
export async function getLog(repoPath: string, maxCount = 50): Promise<GitLogEntry[]> {
  const git = simpleGit(repoPath)
  const out = await git.raw([
    'log',
    '--max-count', String(maxCount),
    '--format=%H%x00%an%x00%aI%x00%s%x00%D'
  ])
  return out
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, message, refs] = line.split('\0')
      return { hash, author, date, message, refs: refs ?? '' }
    })
}

/** Resolve the integration branch: main > master > origin's default. Null if none. */
export async function resolveMainBranch(repoPath: string): Promise<string | null> {
  const git = simpleGit(repoPath)
  const local = (await git.raw(['branch', '--format=%(refname:short)']))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (local.includes('main')) return 'main'
  if (local.includes('master')) return 'master'
  try {
    const sym = (await git.raw(['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD'])).trim()
    const mapped = sym.replace(/^origin\//, '')
    if (mapped && local.includes(mapped)) return mapped
  } catch {
    /* no origin/HEAD — ignore */
  }
  return null
}

/** Position of the worktree's branch relative to main, for the header graph. */
export async function getWorktreeGraph(
  worktreePath: string,
  fallbackMain?: string
): Promise<WorktreeGraph> {
  const git = simpleGit(worktreePath)
  const branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim() || 'HEAD'
  const mainBranch = (await resolveMainBranch(worktreePath)) ?? fallbackMain
  if (!mainBranch) throw new Error('No main/master branch found to compare against.')
  const aheadCount =
    parseInt((await git.raw(['rev-list', '--count', `${mainBranch}..HEAD`])).trim(), 10) || 0
  const behind =
    parseInt((await git.raw(['rev-list', '--count', `HEAD..${mainBranch}`])).trim(), 10) || 0
  const ahead: WorktreeCommit[] =
    aheadCount > 0
      ? (await git.raw(['log', `${mainBranch}..HEAD`, '--format=%h%x00%s']))
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const [hash, subject] = line.split('\0')
            return { hash, subject }
          })
      : []
  const baseRaw = (await git.raw(['merge-base', mainBranch, 'HEAD'])).trim()
  return { branch, mainBranch, ahead, behind, baseHash: baseRaw.slice(0, 7) }
}

/** Unstaged line changes in the worktree (working tree vs index). */
export async function getWorktreeDiff(worktreePath: string): Promise<WorktreeDiffStat> {
  const git = simpleGit(worktreePath)
  const out = await git.raw(['diff', 'HEAD', '--numstat'])
  let added = 0
  let deleted = 0
  let files = 0
  for (const line of out.split('\n').filter(Boolean)) {
    const [a, d] = line.split('\t')
    files++
    if (a && a !== '-') added += parseInt(a, 10) || 0
    if (d && d !== '-') deleted += parseInt(d, 10) || 0
  }
  const status = await git.raw(['status', '--porcelain'])
  return { added, deleted, files, hasChanges: status.trim().length > 0 }
}

/** Stage everything and commit to the worktree branch. */
export async function commitWorktree(worktreePath: string, message: string): Promise<void> {
  const git = simpleGit(worktreePath)
  await git.raw(['add', '-A'])
  // simpleGit.raw does not reject on "nothing to commit"; treat it as a no-op
  // (the UI gates the button on hasChanges, so this is just a race fallback).
  const staged = await git.raw(['diff', '--cached', '--numstat'])
  if (!staged.trim()) return
  await git.raw(['commit', '-q', '-m', message])
}

/** Merge the worktree branch into main, run from the main working tree. */
export async function mergeWorktreeToMain(
  workspacePath: string,
  branch: string,
  mainBranch: string
): Promise<void> {
  const git = simpleGit(workspacePath)
  const cur = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
  if (!cur || cur === 'HEAD') {
    throw new Error(`Main working tree is in detached HEAD. Check out ${mainBranch} first.`)
  }
  if (cur !== mainBranch) {
    throw new Error(`Main working tree is on '${cur}', not '${mainBranch}'. Switch to ${mainBranch} first.`)
  }
  // simpleGit.raw does not reject on a conflicted merge (no "error:" marker),
  // so detect unmerged paths explicitly and abort to keep the tree usable.
  let hardErr: unknown = null
  try {
    await git.raw(['merge', '--no-edit', branch])
  } catch (e) {
    hardErr = e
  }
  const conflict = (await git.raw(['diff', '--name-only', '--diff-filter=U'])).trim().length > 0
  if (conflict || hardErr) {
    try {
      await git.raw(['merge', '--abort'])
    } catch {
      /* not in a merge state */
    }
    if (conflict) {
      throw new Error(`Merge aborted: conflicts merging ${branch} into ${mainBranch}. Resolve them and retry.`)
    }
    throw hardErr
  }
}

/** Rebase the worktree branch onto main. Aborts on conflict so the tree stays usable. */
export async function rebaseWorktree(worktreePath: string, mainBranch: string): Promise<void> {
  const git = simpleGit(worktreePath)
  try {
    await git.raw(['rebase', mainBranch])
  } catch {
    try {
      await git.raw(['rebase', '--abort'])
    } catch {
      /* not in a rebase state */
    }
    throw new Error(`Rebase aborted: conflicts replaying onto ${mainBranch}. Resolve them in the terminal and retry.`)
  }
}
