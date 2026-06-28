import { useEffect, useState } from 'react'

export function Welcome() {
  const [recent, setRecent] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    window.superpi.listRecentFolders().then(setRecent)
  }, [])

  async function open(): Promise<void> {
    setBusy(true)
    try {
      await window.superpi.openFolder()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-zinc-950">
      <div className="max-w-lg text-center">
        <h1 className="mb-3 text-2xl font-bold text-zinc-100">superpi</h1>
        <p className="mb-6 text-sm text-zinc-400">
          A worktree + terminal manager for oh-my-pi. Open a folder to launch parallel agents —
          each in its own git worktree.
        </p>
        <button
          onClick={open}
          disabled={busy}
          className="rounded bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? 'Opening…' : 'Open Folder'}
        </button>
        <p className="mt-6 text-xs text-zinc-600">
          Or launch from a terminal:{' '}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
            superpi /path/to/folder
          </code>
        </p>
        {recent.length > 0 && (
          <div className="mt-8 text-left">
            <p className="mb-2 text-xs uppercase tracking-wide text-zinc-500">Recent</p>
            <ul className="space-y-1">
              {recent.map((p) => (
                <li key={p}>
                  <button
                    onClick={() => window.superpi.openPath(p)}
                    className="block w-full truncate rounded px-2 py-1 text-left text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    {p}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
