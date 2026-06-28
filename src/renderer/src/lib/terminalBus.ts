type DataCb = (data: string) => void

// Per-session terminal data fan-out: the App subscribes once to the global
// IPC data stream and dispatches here; each TerminalPane subscribes to its id.
const subs = new Map<string, Set<DataCb>>()

export function onTermData(id: string, cb: DataCb): () => void {
  let set = subs.get(id)
  if (!set) {
    set = new Set()
    subs.set(id, set)
  }
  set.add(cb)
  return () => {
    const s = subs.get(id)
    if (!s) return
    s.delete(cb)
    if (s.size === 0) subs.delete(id)
  }
}

export function emitTermData(id: string, data: string): void {
  subs.get(id)?.forEach((cb) => cb(data))
}
