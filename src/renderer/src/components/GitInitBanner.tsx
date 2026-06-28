import { useState } from 'react'
import type { WorkspaceInfo } from '@shared/types'

export function GitInitBanner({ workspace }: { workspace: WorkspaceInfo }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function init(): Promise<void> {
    setBusy(true)
    setErr(null)
    try {
      await window.superpi.initGit(workspace.path)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950">
      <div className="max-w-md text-center">
        <h2 className="mb-2 text-lg font-semibold text-zinc-100">Not a git repository</h2>
        <p className="mb-1 text-sm text-zinc-400">{workspace.path}</p>
        <p className="mb-5 text-sm text-zinc-500">
          superpi manages agents as git worktrees, which need a repository. Initialize one here to
          continue?
        </p>
        {err && <p className="mb-3 text-xs text-red-400">{err}</p>}
        <button
          onClick={init}
          disabled={busy}
          className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? 'Initializing…' : 'Initialize git repository'}
        </button>
      </div>
    </div>
  )
}
