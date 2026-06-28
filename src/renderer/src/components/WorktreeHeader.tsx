import { useCallback, useEffect, useState } from 'react'
import type { WorktreeActionResult, WorktreeGitState } from '@shared/types'
import { WorktreeGraph } from './WorktreeGraph'

const POLL_MS = 2000

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/** Header above a worktree terminal: branch graph, merge/commit/rebase controls,
 * and the unstaged +/- LoC. Polls git state and refreshes after each action. */
export function WorktreeHeader({ id }: { id: string }) {
  const [state, setState] = useState<WorktreeGitState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setState(await window.superpi.worktreeGitState(id))
      setError(null)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [id])

  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(t)
  }, [refresh])

  async function run(label: string, fn: () => Promise<WorktreeActionResult>): Promise<void> {
    setBusy(true)
    try {
      const r = await fn()
      setError(r.ok ? null : r.error ? `${label}: ${r.error}` : `${label} failed`)
      await refresh()
    } catch (e) {
      setError(`${label}: ${errMsg(e)}`)
    } finally {
      setBusy(false)
    }
  }

  function commit(): Promise<void> {
    const msg = message.trim()
    if (!msg) return Promise.resolve()
    return run('Commit', async () => {
      const r = await window.superpi.commitWorktree(id, msg)
      if (r.ok) setMessage('')
      return r
    })
  }

  const graph = state?.graph
  const diff = state?.diff
  const canMerge = !busy && !!graph && graph.ahead.length > 0
  const canRebase = !busy && !!graph && graph.behind > 0
  const canCommit = !busy && message.trim().length > 0 && !!diff && diff.hasChanges

  const btn =
    'rounded border border-zinc-700 px-2 py-1 text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-400">
      {graph && <WorktreeGraph graph={graph} />}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className={btn}
          disabled={!canMerge}
          onClick={() => void run('Merge', () => window.superpi.mergeWorktreeToMain(id))}
        >
          Merge
        </button>
        <button
          type="button"
          className={btn}
          disabled={!canRebase}
          onClick={() => void run('Rebase', () => window.superpi.rebaseWorktree(id))}
        >
          Rebase
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canCommit) void commit()
          }}
          placeholder="commit message"
          className="w-44 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none"
        />
        <button type="button" className={btn} disabled={!canCommit} onClick={() => void commit()}>
          Commit
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2 font-mono">
        {diff && (
          <>
            <span className="text-emerald-400">+{diff.added}</span>
            <span className="text-red-400">−{diff.deleted}</span>
            <span className="text-zinc-600">
              {diff.files} {diff.files === 1 ? 'file' : 'files'}
            </span>
          </>
        )}
      </div>

      {error && (
        <span className="w-full truncate text-red-400" title={error}>
          {error}
        </span>
      )}
    </div>
  )
}
