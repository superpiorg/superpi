import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { WorkspaceInfo } from '@shared/types'
import { APP_DIR, WORKSPACE_FILE } from './paths'
import { checkIsRepo } from './git'

/**
 * Tracks the currently-open workspace folder and persists the last one.
 * The app does NOT auto-restore on launch (a folder must be given via argv or
 * the Open Folder button), but the path is remembered for recent-folders.
 */
export class WorkspaceController extends EventEmitter {
  current: WorkspaceInfo | null = null

  constructor() {
    super()
    mkdirSync(APP_DIR, { recursive: true })
  }

  savedPath(): string | null {
    if (!existsSync(WORKSPACE_FILE)) return null
    try {
      const raw = JSON.parse(readFileSync(WORKSPACE_FILE, 'utf8')) as { path?: string }
      return raw.path ?? null
    } catch {
      return null
    }
  }

  async set(path: string): Promise<WorkspaceInfo> {
    const absPath = resolve(path)
    const isGit = await checkIsRepo(absPath)
    this.current = { path: absPath, isGit }
    writeFileSync(WORKSPACE_FILE, JSON.stringify({ path: absPath }))
    this.emit('changed', this.current)
    return this.current
  }

  async refresh(): Promise<WorkspaceInfo | null> {
    if (!this.current) return null
    return this.set(this.current.path)
  }
}
