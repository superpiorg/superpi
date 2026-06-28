import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { SuperpiAPI } from '@shared/types'

type Handler = (e: IpcRendererEvent, ...args: unknown[]) => void

const api: SuperpiAPI = {
  // Workspace
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  openFolder: () => ipcRenderer.invoke('workspace:open'),
  openPath: (path) => ipcRenderer.invoke('workspace:openPath', path),
  initGit: (path) => ipcRenderer.invoke('workspace:initGit', path),
  listRecentFolders: () => ipcRenderer.invoke('workspace:recentFolders'),
  gitLog: () => ipcRenderer.invoke('git:log'),
  onWorkspaceChanged: (cb) => {
    const h: Handler = (_e, ws) => cb(ws as never)
    ipcRenderer.on('workspace:changed', h)
    return () => ipcRenderer.off('workspace:changed', h)
  },

  // Agents
  listAgents: () => ipcRenderer.invoke('agent:list'),
  createAgent: (opts) => ipcRenderer.invoke('agent:create', opts),
  removeAgent: (id) => ipcRenderer.invoke('agent:remove', id),
  renameAgent: (id, name) => ipcRenderer.invoke('agent:rename', id, name),
  reviveAgent: (id) => ipcRenderer.invoke('agent:revive', id),
  onAgentListChanged: (cb) => {
    const h: Handler = (_e, list) => cb(list as never)
    ipcRenderer.on('agent:list:changed', h)
    return () => ipcRenderer.off('agent:list:changed', h)
  },

  // Configs
  listConfigs: () => ipcRenderer.invoke('config:list'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  deleteConfig: (id) => ipcRenderer.invoke('config:delete', id),
  getDefaultConfig: () => ipcRenderer.invoke('config:default'),

  // Terminal + status
  terminalAttach: (id) => ipcRenderer.invoke('terminal:attach', id),
  terminalInput: (id, data) => {
    ipcRenderer.send('terminal:input', id, data)
    return Promise.resolve()
  },
  terminalResize: (id, cols, rows) => {
    ipcRenderer.send('terminal:resize', id, cols, rows)
    return Promise.resolve()
  },
  getStatus: (id) => ipcRenderer.invoke('status:get', id),
  onTerminalData: (cb) => {
    const h: Handler = (_e, id, data) => cb(id as string, data as string)
    ipcRenderer.on('terminal:data', h)
    return () => ipcRenderer.off('terminal:data', h)
  },
  onStatusChanged: (cb) => {
    const h: Handler = (_e, info) => cb(info as never)
    ipcRenderer.on('status:changed', h)
    return () => ipcRenderer.off('status:changed', h)
  },

  // Worktree git
  worktreeGitState: (id) => ipcRenderer.invoke('worktree:gitState', id),
  commitWorktree: (id, message) => ipcRenderer.invoke('worktree:commit', id, message),
  mergeWorktreeToMain: (id) => ipcRenderer.invoke('worktree:merge', id),
  rebaseWorktree: (id) => ipcRenderer.invoke('worktree:rebase', id),

  // Window controls
  windowMinimize: () => {
    ipcRenderer.send('window:minimize')
    return Promise.resolve()
  },
  windowMaximize: () => {
    ipcRenderer.send('window:maximize')
    return Promise.resolve()
  },
  windowClose: () => {
    ipcRenderer.send('window:close')
    return Promise.resolve()
  },
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  onWindowMaximizedChanged: (cb) => {
    const h: Handler = (_e, val) => cb(val as boolean)
    ipcRenderer.on('window:maximizedChanged', h)
    return () => ipcRenderer.off('window:maximizedChanged', h)
  }
}

contextBridge.exposeInMainWorld('superpi', api)
