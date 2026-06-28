import '@xterm/xterm/css/xterm.css'
import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { onTermData } from '../lib/terminalBus'
import { WorktreeHeader } from './WorktreeHeader'

type AttachState = 'loading' | 'self' | 'remote' | 'error'

export function TerminalPane({ id }: { id: string }) {
  const elRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<AttachState>('loading')

  // Resolve attach state on mount / id change.
  useEffect(() => {
    setState('loading')
    let cancelled = false
    window.superpi.terminalAttach(id).then((res) => {
      if (cancelled) return
      if (!res) { setState('error'); return }
      setState(res.remote ? 'remote' : 'self')
    })
    return () => { cancelled = true }
  }, [id])

  // Only wire up xterm when this instance owns the PTY.
  useEffect(() => {
    if (state !== 'self') return
    const el = elRef.current
    if (!el) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#e4e4e7' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(el)
    // Defer fit so the DOM layout settles (otherwise offsetWidth/Height may be 0).
    requestAnimationFrame(() => { try { fit.fit() } catch { /* layout not ready yet */ } })

    let disposed = false

    window.superpi.terminalAttach(id).then((res) => {
      if (!res || disposed || res.remote) return
      if (res.ring) term.write(res.ring)
      // NOTE: do NOT term.resize(res.cols, res.rows) here — it would override
      // the FitAddon's correct sizing with stale PTY defaults, and because the
      // DOM div doesn't change size, ResizeObserver never fires to fix it.
    })

    const offInput = term.onData((d) => window.superpi.terminalInput(id, d))
    const offResize = term.onResize(({ cols, rows }) => window.superpi.terminalResize(id, cols, rows))
    const offData = onTermData(id, (d) => term.write(d))

    const ro = new ResizeObserver(() => { try { fit.fit() } catch { /* ignore */ } })
    ro.observe(el)

    return () => {
      disposed = true
      offInput.dispose()
      offResize.dispose()
      offData()
      ro.disconnect()
      term.dispose()
    }
  }, [id, state])

  let body: JSX.Element
  if (state === 'loading') {
    body = <div className="h-full w-full bg-zinc-950" />
  } else if (state === 'remote') {
    body = (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Agent is running in another superpi window.
      </div>
    )
  } else if (state === 'error') {
    body = (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        Failed to attach to agent.
      </div>
    )
  } else {
    body = <div ref={elRef} className="h-full w-full p-1" />
  }

  return (
    <div className="flex h-full w-full flex-col">
      <WorktreeHeader id={id} />
      <div className="flex-1 overflow-hidden">{body}</div>
    </div>
  )
}
