import { homedir } from 'node:os'
import { join } from 'node:path'

export const APP_DIR = join(homedir(), '.superpi')
export const AGENTS_FILE = join(APP_DIR, 'agents.json')
export const CONFIGS_FILE = join(APP_DIR, 'configs.json')
export const WORKSPACE_FILE = join(APP_DIR, 'workspace.json')
export const SESSIONS_DIR = join(APP_DIR, 'sessions')
/** Worktrees are created inside the workspace, under this subdir. */
export const WORKTREE_SUBDIR = '.superpi'

export function sessionDirFor(id: string): string {
  return join(SESSIONS_DIR, id)
}

export function eventsFileFor(id: string): string {
  return join(sessionDirFor(id), 'events.jsonl')
}

export function lockFileFor(id: string): string {
  return join(sessionDirFor(id), 'lock')
}
