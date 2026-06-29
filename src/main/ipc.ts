import { BrowserWindow, dialog, ipcMain } from 'electron'
import simpleGit from 'simple-git'
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { AgentConfig, AgentDescriptor, AgentKind, GitLogEntry, TerminalAttachResult, WorktreeActionResult, WorktreeGitState, WorkspaceInfo } from '@shared/types'
import { eventsFileFor, sessionDirFor } from './paths'
import { commitWorktree, getLog, getWorktreeDiff, getWorktreeGraph, initRepo, mergeWorktreeToMain, rebaseWorktree, resolveMainBranch } from './git'
import type { AgentStore } from './agents'
import type { ConfigStore } from './configs'
import type { StatusWatcher } from './status'
import type { TerminalManager } from './terminal'
import { type WorktreeManager, linkNodeModules } from './worktree'
import type { WorkspaceController } from './workspace'

export interface Ctx {
  agents: AgentStore
  configs: ConfigStore
  worktrees: WorktreeManager
  terminals: TerminalManager
  status: StatusWatcher
  workspace: WorkspaceController
}

function requireWorkspace(c: Ctx): WorkspaceInfo {
  const ws = c.workspace.current
  if (!ws) throw new Error('No folder is open.')
  if (!ws.isGit) throw new Error('This folder is not a git repository. Initialize one first.')
  return ws
}

export function registerIpc(_win: BrowserWindow, c: Ctx): void {
  // ---- Workspace ----
  ipcMain.handle('workspace:get', () => c.workspace.current)
  ipcMain.handle('workspace:recentFolders', () => c.agents.recentWorkspaces())

  ipcMain.handle('workspace:open', async (): Promise<WorkspaceInfo | null> => {
    const res = await dialog.showOpenDialog({ title: 'Open folder', properties: ['openDirectory'] })
    if (res.canceled || res.filePaths.length === 0) return null
    const path = res.filePaths[0]
    const ws = await c.workspace.set(path)
    c.agents.setWorkspace(path)
    return ws
  })

  ipcMain.handle('workspace:openPath', async (_e, path: string): Promise<WorkspaceInfo> => {
    const ws = await c.workspace.set(path)
    c.agents.setWorkspace(path)
    return ws
  })

  ipcMain.handle('workspace:initGit', async (_e, path: string): Promise<WorkspaceInfo> => {
    await initRepo(path)
    const ws = await c.workspace.refresh()
    if (!ws) throw new Error('No workspace open')
    return ws
  })

  // ---- Git ----
  ipcMain.handle('git:log', async (_e): Promise<GitLogEntry[]> => {
    const ws = requireWorkspace(c)
    return getLog(ws.path)
  })

  // ---- Agents (worktrees in the current workspace) ----
  ipcMain.handle('agent:list', () => c.agents.list())

  ipcMain.handle(
    'agent:create',
    async (_e, opts: { configId?: string; name?: string; kind?: AgentKind; cwdPath?: string }): Promise<AgentDescriptor> => {
      const ws = requireWorkspace(c)
      const kind = opts.kind ?? 'omp'
      const isTerminal = kind === 'terminal'

      const config = isTerminal
        ? { id: '', name: 'Terminal', isDefault: false }
        : (opts.configId ? c.configs.get(opts.configId) : c.configs.default())
      if (!config && !isTerminal) throw new Error('No agent config available.')

      const id = randomUUID()
      const sessionDir = sessionDirFor(id)
      mkdirSync(sessionDir, { recursive: true })
      const shortId = id.slice(0, 6)
      const defaultName = isTerminal ? `sh-${shortId}` : `omp-${shortId}`
      const name = opts.name && opts.name.trim() ? opts.name.trim() : defaultName

      let worktreePath: string
      let branch: string
      if (opts.cwdPath) {
        worktreePath = opts.cwdPath
        try {
          const ref = (await simpleGit(opts.cwdPath).revparse(['--abbrev-ref', 'HEAD'])).trim()
          branch = ref && ref !== 'HEAD' ? ref : 'main'
        } catch {
          branch = 'main'
        }
      } else {
        const info = await c.worktrees.create(ws.path, id, config?.baseBranch)
        worktreePath = info.worktreePath
        branch = info.branch
        linkNodeModules(ws.path, worktreePath)
      }
      const desc: AgentDescriptor = {
        id,
        name,
        kind,
        configId: config?.id ?? '',
        workspacePath: ws.path,
        worktreePath,
        branch,
        sessionDir,
        eventsFile: eventsFileFor(id),
        createdAt: Date.now()
      }
      if (!isTerminal) writeFileSync(desc.eventsFile, '')
      c.agents.upsert(desc)
      c.terminals.spawn(id, worktreePath, sessionDir, kind, config)
      if (!isTerminal) c.status.watch(id, sessionDir, desc.eventsFile)
      return desc
    }
  )

  ipcMain.handle('agent:remove', async (_e, id: string): Promise<void> => {
    const a = c.agents.get(id)
    if (a) {
      c.terminals.kill(id)
      c.status.unwatch(id)
      // Never remove the workspace root itself — only actual git worktrees.
      if (a.worktreePath !== a.workspacePath) {
        const others = c.agents.list().filter((x) => x.id !== id)
        if (!others.some((x) => x.worktreePath === a.worktreePath)) {
          await c.worktrees.remove(a.workspacePath, a.worktreePath, a.branch)
        }
      }
    }
    c.agents.remove(id)
    // Clean up the session directory (events, lock, session .jsonl).
    try { rmSync(sessionDirFor(id), { recursive: true, force: true }) } catch { /* ignore */ }
  })

  ipcMain.handle('agent:rename', async (_e, id: string, name: string): Promise<void> => {
    const a = c.agents.rename(id, name)
    if (!a) throw new Error(`Agent not found: ${id}`)
  })

  ipcMain.handle('agent:revive', async (_e, id: string): Promise<void> => {
    if (c.terminals.has(id) || c.terminals.isOwnedByOther(id)) return
    const a = c.agents.get(id)
    if (!a) throw new Error(`Agent not found: ${id}`)
    const config = c.configs.get(a.configId) ?? c.configs.default()
    c.terminals.spawn(id, a.worktreePath, a.sessionDir, a.kind, config, 100, 30, true)
    if (a.kind !== 'terminal') c.status.watch(id, a.sessionDir, a.eventsFile)
  })

  // ---- Configs ----
  ipcMain.handle('config:list', () => c.configs.list())
  ipcMain.handle('config:default', () => c.configs.default())
  ipcMain.handle('config:save', (_e, cfg: AgentConfig) => c.configs.save(cfg))
  ipcMain.handle('config:delete', (_e, id: string) => c.configs.delete(id))

  // ---- Terminal + status ----
  ipcMain.on('terminal:input', (_e, id: string, data: string) => c.terminals.write(id, data))
  ipcMain.on('terminal:resize', (_e, id: string, cols: number, rows: number) =>
    c.terminals.resize(id, cols, rows)
  )
  ipcMain.handle('terminal:attach', (_e, id: string): TerminalAttachResult | null => {
    // Already have a PTY? Return current state.
    const size = c.terminals.size(id)
    if (size) return { ring: c.terminals.ring(id), cols: size.cols, rows: size.rows, remote: false }

    // No PTY. Another instance owns it? Tell the renderer.
    if (c.terminals.isOwnedByOther(id)) {
      return { ring: '', cols: 100, rows: 30, remote: true }
    }

    // No owner — respawn from the persisted descriptor.
    const agent = c.agents.get(id)
    if (!agent) return null

    const config = c.configs.get(agent.configId)
    c.terminals.spawn(id, agent.worktreePath, agent.sessionDir, agent.kind, config)
    if (agent.kind !== 'terminal') c.status.watch(id, agent.sessionDir, agent.eventsFile)

    const sz = c.terminals.size(id)
    if (!sz) return null
    return { ring: c.terminals.ring(id), cols: sz.cols, rows: sz.rows, remote: false }
  })
  ipcMain.handle('status:get', (_e, id: string) => c.status.snapshot(id))

  // ---- Worktree git (graph + actions) ----
  ipcMain.handle('worktree:gitState', async (_e, id: string): Promise<WorktreeGitState | null> => {
    const a = c.agents.get(id)
    if (!a) return null
    try {
      const [graph, diff] = await Promise.all([
        getWorktreeGraph(a.worktreePath, a.branch),
        getWorktreeDiff(a.worktreePath)
      ])
      return { graph, diff }
    } catch {
      return null
    }
  })

  ipcMain.handle('worktree:commit', async (_e, id: string, message: string): Promise<WorktreeActionResult> => {
    const a = c.agents.get(id)
    if (!a) return { ok: false, error: `Agent not found: ${id}` }
    try {
      await commitWorktree(a.worktreePath, message)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('worktree:merge', async (_e, id: string): Promise<WorktreeActionResult> => {
    const a = c.agents.get(id)
    if (!a) return { ok: false, error: `Agent not found: ${id}` }
    try {
      const main = await resolveMainBranch(a.workspacePath)
      if (!main) return { ok: false, error: 'No main/master branch found to merge into.' }
      await mergeWorktreeToMain(a.workspacePath, a.branch, main)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('worktree:rebase', async (_e, id: string): Promise<WorktreeActionResult> => {
    const a = c.agents.get(id)
    if (!a) return { ok: false, error: `Agent not found: ${id}` }
    try {
      const main = await resolveMainBranch(a.workspacePath)
      if (!main) return { ok: false, error: 'No main/master branch found to rebase onto.' }
      await rebaseWorktree(a.worktreePath, main)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })
}
