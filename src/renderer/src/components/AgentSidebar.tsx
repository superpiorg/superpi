import { useState, useRef, useEffect } from 'react'
import type { AgentDescriptor, AgentStatusInfo, GitLogEntry, WorkspaceInfo } from '@shared/types'
import { ConfigsDialog } from './ConfigsDialog'

interface Props {
  workspace: WorkspaceInfo
  agents: AgentDescriptor[]
  statuses: Record<string, AgentStatusInfo>
  activeId: string | null
  onSelect: (id: string) => void
}

const STATUS_DOT: Record<string, string> = {
  starting: 'bg-zinc-400',
  working: 'bg-amber-400 animate-pulse',
  idle: 'bg-emerald-400',
  stopped: 'bg-zinc-600',
  error: 'bg-red-500'
}

export function AgentSidebar({ workspace, agents, statuses, activeId, onSelect }: Props) {
  const [creating, setCreating] = useState(false)
  const [configsOpen, setConfigsOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftName, setDraftName] = useState('')
  const [showGitLog, setShowGitLog] = useState(false)
  const [gitLog, setGitLog] = useState<GitLogEntry[]>([])
  const [gitLogLoading, setGitLogLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId) inputRef.current?.select()
  }, [editingId])

  async function newAgent(): Promise<void> {
    setCreating(true)
    try {
      await window.superpi.createAgent({})
    } catch (err) {
      console.error('[superpi] createAgent failed:', err)
    } finally {
      setCreating(false)
    }
  }

  async function newTerminal(): Promise<void> {
    setCreating(true)
    try {
      await window.superpi.createAgent({ kind: 'terminal', cwdPath: workspace.path, name: 'main' })
    } catch (err) {
      console.error('[superpi] createAgent (terminal) failed:', err)
    } finally {
      setCreating(false)
    }
  }

  async function spawnTerminalOnAgent(a: AgentDescriptor): Promise<void> {
    try {
      await window.superpi.createAgent({ kind: 'terminal', cwdPath: a.worktreePath, name: `sh-${a.name}` })
    } catch (err) {
      console.error('[superpi] spawnTerminalOnAgent failed:', err)
    }
  }

  function startRename(id: string, name: string): void {
    setEditingId(id)
    setDraftName(name)
    setConfirmId(null)
  }

  async function saveRename(id: string): Promise<void> {
    const name = draftName.trim()
    if (!name) {
      setEditingId(null)
      return
    }
    setEditingId(null)
    await window.superpi.renameAgent(id, name)
  }

  const title = workspace.path.split('/').filter(Boolean).pop() ?? workspace.path

  async function toggleGitLog(): Promise<void> {
    if (showGitLog) {
      setShowGitLog(false)
      return
    }
    setShowGitLog(true)
    setGitLogLoading(true)
    try {
      const entries = await window.superpi.gitLog()
      setGitLog(entries)
    } finally {
      setGitLogLoading(false)
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
      <div className="px-4 py-3">
        <span className="block truncate text-sm font-semibold text-zinc-200" title={workspace.path}>
          {title}
        </span>
      </div>

      <div className="border-b border-zinc-800">
        <button
          onClick={newAgent}
          disabled={creating}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
            />
          </svg>
          New agent
        </button>
        <button
          onClick={() => setConfigsOpen(true)}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.006-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.006-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Config
        </button>
        <button
          onClick={toggleGitLog}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
          Git log
        </button>
        <button
          onClick={newTerminal}
          disabled={creating}
          className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4 shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z"
            />
          </svg>
          Terminal <span className="text-zinc-500">main</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {agents.length === 0 && <p className="px-4 py-2 text-xs text-zinc-500">No agents yet.</p>}
        {agents.map((a) => {
          const status = statuses[a.id]?.status ?? 'starting'
          const active = a.id === activeId
          const confirming = confirmId === a.id
          const editing = editingId === a.id
          return (
            <div
              key={a.id}
              onClick={() => { if (!editing) onSelect(a.id) }}
              className={`group cursor-pointer border-l-2 px-4 py-2 ${
                active ? 'border-emerald-400 bg-zinc-800' : 'border-transparent hover:bg-zinc-800/60'
              }`}
            >
              <div className="flex items-center gap-2">
                {a.kind === 'terminal' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3 w-3 shrink-0 text-zinc-500">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
                  </svg>
                ) : (
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status] ?? 'bg-zinc-500'}`} />
                )}
                {editing ? (
                  <input
                    ref={inputRef}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(a.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    onBlur={() => saveRename(a.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full bg-zinc-800 text-sm text-zinc-100 outline-none"
                    maxLength={80}
                  />
                ) : (
                  <span className="truncate text-sm text-zinc-100">{a.name}</span>
                )}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-zinc-500">{a.branch}</span>
                {editing ? (
                  <span className="shrink-0 text-[11px] text-zinc-500">enter to save</span>
                ) : confirming ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        window.superpi.removeAgent(a.id)
                        setConfirmId(null)
                      }}
                      className="text-[11px] text-red-400 hover:underline"
                    >
                      delete?
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmId(null)
                      }}
                      className="text-[11px] text-zinc-400 hover:underline"
                    >
                      cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        spawnTerminalOnAgent(a)
                      }}
                      className="text-[11px] text-zinc-500 opacity-0 hover:text-zinc-300 group-hover:opacity-100"
                    >
                      terminal
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(a.id, a.name)
                      }}
                      className="text-[11px] text-zinc-500 opacity-0 hover:text-zinc-300 group-hover:opacity-100"
                    >
                      rename
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setConfirmId(a.id)
                      }}
                      className="text-[11px] text-zinc-500 opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      remove
                    </button>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {showGitLog && (
        <div className="border-t border-zinc-800 bg-zinc-900 overflow-y-auto" style={{ maxHeight: '30vh' }}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Git log</span>
            <button
              onClick={() => setShowGitLog(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {gitLogLoading ? (
            <div className="px-4 py-2 text-xs text-zinc-500">Loading...</div>
          ) : gitLog.length === 0 ? (
            <div className="px-4 py-2 text-xs text-zinc-500">No commits yet.</div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {gitLog.map((entry) => (
                <div key={entry.hash} className="px-4 py-2">
                  <div className="flex items-start gap-1.5">
                    <span className="shrink-0 text-[11px] font-mono text-amber-500">{entry.hash.slice(0, 7)}</span>
                    {entry.refs && (
                      <span className="shrink-0 text-[11px] font-mono text-emerald-400">{entry.refs.replace('HEAD -> ', '').replace(', ', ' ')}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-100 leading-tight mt-0.5">{entry.message}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    {entry.author}
                    <span className="mx-1">·</span>
                    {entry.date.slice(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {configsOpen && <ConfigsDialog onClose={() => setConfigsOpen(false)} />}
    </aside>
  )
}
