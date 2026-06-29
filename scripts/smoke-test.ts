// Headless smoke test of the pure main-process logic. The Electron GUI can't
// run here (no display), but these modules are now free of the electron
// dependency and can be exercised directly in Node.
//
//   HOME=$(mktemp -d) node --experimental-strip-types scripts/smoke-test.ts

import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WorktreeManager, linkNodeModules } from '../src/main/worktree'
import { StatusWatcher } from '../src/main/status'

let failures = 0
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  \u2713 ${name}`)
  } else {
    console.log(`  \u2717 ${name} ${detail}`)
    failures++
  }
}

/** git via arg array — no shell, so %(refname:short) etc. are safe. */
function git(args: string[], cwd: string): string {
  return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim()
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>()
  setTimeout(resolve, ms)
  return promise
}

function appendEvent(file: string, type: string, data: Record<string, unknown> = {}): void {
  writeFileSync(file, JSON.stringify({ ts: Date.now(), type, data }) + '\n', { flag: 'a' })
}

async function testWorktree(): Promise<void> {
  console.log('WorktreeManager')
  const repo = mkdtempSync(join(tmpdir(), 'pidesk-repo-'))
  git(['init', '-q'], repo)
  git(['config', 'user.email', 't@t.tt'], repo)
  git(['config', 'user.name', 't'], repo)
  try {
    git(['checkout', '-q', '-b', 'main'], repo)
  } catch {
    /* already on a branch */
  }
  writeFileSync(join(repo, 'README.md'), 'hello\n')
  git(['add', '-A'], repo)
  git(['commit', '-q', '-m', 'init'], repo)

  const wm = new WorktreeManager()
  const { worktreePath, branch } = await wm.create(repo, 'abc12345')

  check('worktree dir created', existsSync(worktreePath))
  check('worktree checked out file present', existsSync(join(worktreePath, 'README.md')))
  const branches = git(['branch', '--format=%(refname:short)'], repo)
  check('branch created', branches.includes(branch), `want ${branch}`)
  check(
    'worktree branch reads back via rev-parse (not main)',
    git(['rev-parse', '--abbrev-ref', 'HEAD'], worktreePath) === branch,
    `want ${branch}`
  )
  check('worktree lives under repo .superpi', worktreePath.includes('.superpi'))
  check('local exclude file exists', existsSync(join(repo, '.git', 'info', 'exclude')))

  mkdirSync(join(repo, 'node_modules'), { recursive: true }) // fake deps in workspace
  linkNodeModules(repo, worktreePath)
  check(
    'node_modules linked into worktree',
    lstatSync(join(worktreePath, 'node_modules')).isSymbolicLink()
  )

  await wm.remove(repo, worktreePath, branch)
  check('worktree removed', !existsSync(worktreePath))
  const branchesAfter = git(['branch', '--format=%(refname:short)'], repo)
  check('branch deleted', !branchesAfter.includes(branch))

  rmSync(repo, { recursive: true, force: true })
}

async function testStatus(): Promise<void> {
  console.log('StatusWatcher')
  const dir = mkdtempSync(join(tmpdir(), 'pidesk-status-'))
  const eventsFile = join(dir, 'events.jsonl')
  writeFileSync(eventsFile, '')

  const sw = new StatusWatcher()
  const states: string[] = []
  sw.on('changed', (info) => states.push(info.status))

  sw.watch('s1', dir, eventsFile)
  await sleep(60)

  appendEvent(eventsFile, 'session_start')
  await sleep(400)
  appendEvent(eventsFile, 'agent_start')
  await sleep(400)
  appendEvent(eventsFile, 'tool_call', { tool: 'bash' })
  await sleep(400)
  appendEvent(eventsFile, 'agent_end')
  await sleep(400)

  check('observed working state', states.includes('working'), JSON.stringify(states))
  check('settled to idle', states[states.length - 1] === 'idle', JSON.stringify(states))
  const snap = sw.snapshot('s1')
  check('captured last tool', snap?.lastTool === 'bash', JSON.stringify(snap))

  sw.unwatch('s1')
  rmSync(dir, { recursive: true, force: true })
}

async function main(): Promise<void> {
  await testWorktree()
  await testStatus()
  if (failures > 0) {
    console.error(`\n${failures} check(s) FAILED`)
    process.exit(1)
  }
  console.log('\nall checks passed')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
