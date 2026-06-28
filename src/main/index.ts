import { app, BrowserWindow, shell } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { AgentStore } from './agents'
import { ConfigStore } from './configs'
import { StatusWatcher } from './status'
import { TerminalManager } from './terminal'
import { WorktreeManager } from './worktree'
import { WorkspaceController } from './workspace'

let mainWindow: BrowserWindow | null = null

const agents = new AgentStore()
const configs = new ConfigStore()
const worktrees = new WorktreeManager()
const terminals = new TerminalManager()
const status = new StatusWatcher()
const workspace = new WorkspaceController()

/** Scan argv for an existing directory (skip the electron exe and flags). */
function folderFromArgv(argv: string[]): string | null {
  for (let i = argv.length - 1; i >= 0; i--) {
    const a = argv[i]
    if (a.startsWith('-')) continue
    try {
      if (existsSync(a) && statSync(a).isDirectory()) return a
    } catch {
      /* ignore non-resolvable args */
    }
  }
  return null
}

// Silences the Chromium "GetVSyncParametersIfAvailable() failed" spam; a
// terminal-focused app has no need for GPU compositing.
app.disableHardwareAcceleration()

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'superpi',
    backgroundColor: '#09090b',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.on('closed', () => {
    mainWindow = null
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(async () => {
  workspace.on('changed', (ws) => mainWindow?.webContents.send('workspace:changed', ws))
  agents.on('changed', (list) => mainWindow?.webContents.send('agent:list:changed', list))
  terminals.on('data', (id: string, data: string) =>
    mainWindow?.webContents.send('terminal:data', id, data)
  )
  terminals.on('exit', (id: string) => status.markStopped(id))
  status.on('changed', (info) => mainWindow?.webContents.send('status:changed', info))

  // `superpi /some/folder` opens that folder as the workspace.
  const folder = folderFromArgv(process.argv)
  if (folder) {
    await workspace.set(folder)
    agents.setWorkspace(workspace.current!.path)
    // Revive agents from the previous session: re-spawn their PTYs and
    // re-attach status watchers so they come back to life on launch.
    for (const agent of agents.list()) {
      if (terminals.has(agent.id) || terminals.isOwnedByOther(agent.id)) continue
      try {
        const config = configs.get(agent.configId) ?? configs.default()
        terminals.spawn(agent.id, agent.worktreePath, agent.sessionDir, agent.kind, config, 100, 30, true)
        if (agent.kind !== 'terminal') status.watch(agent.id, agent.sessionDir, agent.eventsFile)
      } catch (err) {
        console.error(`[superpi] failed to revive agent ${agent.id}:`, err)
        status.markStopped(agent.id)
      }
    }
  }

  mainWindow = createWindow()

  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximizedChanged', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximizedChanged', false))

  registerIpc(mainWindow, { agents, configs, worktrees, terminals, status, workspace })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
})

app.on('before-quit', () => terminals.killAll())
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
