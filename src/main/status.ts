import { EventEmitter } from 'node:events'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { AgentStatusInfo } from '@shared/types'

const POLL_MS = 300

interface Watch {
  agentId: string
  sessionDir: string
  eventsFile: string
  info: AgentStatusInfo
  eventsPos: number
  sessionFile?: string
  sessionPos: number
  interval?: NodeJS.Timeout
}

/**
 * Derives read-only agent status by polling the monitor hook's events file
 * (agent/turn/tool lifecycle) and the newest pi session .jsonl (last message).
 * Emits 'changed' (AgentStatusInfo) on meaningful updates.
 */
export class StatusWatcher extends EventEmitter {
  private watches = new Map<string, Watch>()

  watch(agentId: string, sessionDir: string, eventsFile: string): void {
    if (this.watches.has(agentId)) return
    const w: Watch = {
      agentId,
      sessionDir,
      eventsFile,
      eventsPos: existsSync(eventsFile) ? statSync(eventsFile).size : 0,
      sessionPos: 0,
      info: { agentId, status: 'starting', updatedAt: Date.now() }
    }
    this.watches.set(agentId, w)
    this.poll(w)
    this.emit('changed', w.info)
    w.interval = setInterval(() => this.poll(w), POLL_MS)
    w.interval.unref?.()
  }

  unwatch(agentId: string): void {
    const w = this.watches.get(agentId)
    if (w?.interval) clearInterval(w.interval)
    this.watches.delete(agentId)
  }

  snapshot(agentId: string): AgentStatusInfo | null {
    return this.watches.get(agentId)?.info ?? null
  }

  markStopped(agentId: string): void {
    const w = this.watches.get(agentId)
    if (!w) return
    w.info.status = 'stopped'
    w.info.updatedAt = Date.now()
    this.emit('changed', w.info)
  }

  private poll(w: Watch): void {
    this.readEvents(w)
    this.readSession(w)
  }

  private readEvents(w: Watch): void {
    if (!existsSync(w.eventsFile)) return
    try {
      const size = statSync(w.eventsFile).size
      if (size < w.eventsPos) w.eventsPos = 0 // truncated/rotated
      if (size === w.eventsPos) return
      const buf = readFileSync(w.eventsFile, 'utf8')
      for (const line of buf.slice(w.eventsPos).split('\n')) {
        if (!line.trim()) continue
        try {
          this.applyEvent(w, JSON.parse(line))
        } catch {
          /* partial line — will retry next poll */
        }
      }
      w.eventsPos = size
      this.emit('changed', w.info)
    } catch {
      /* IO race — ignore */
    }
  }

  private applyEvent(w: Watch, ev: { type: string; data?: unknown }): void {
    w.info.updatedAt = Date.now()
    const data = (ev.data ?? {}) as { tool?: string }
    switch (ev.type) {
      case 'agent_start':
      case 'turn_start':
        w.info.status = 'working'
        break
      case 'agent_end':
      case 'turn_end':
        w.info.status = 'idle'
        break
      case 'tool_call':
        w.info.status = 'working'
        w.info.lastTool = data.tool
        break
      case 'tool_result':
        w.info.lastTool = data.tool
        break
      case 'session_start':
        w.info.status = 'idle'
        break
    }
  }

  /** Best-effort: newest .jsonl in the session dir, last assistant text. */
  private readSession(w: Watch): void {
    try {
      const files = readdirSync(w.sessionDir).filter((f) => f.endsWith('.jsonl'))
      if (files.length === 0) return
      let newest = ''
      let mtime = 0
      for (const f of files) {
        const st = statSync(join(w.sessionDir, f))
        if (st.mtimeMs > mtime) {
          mtime = st.mtimeMs
          newest = f
        }
      }
      if (!newest) return
      const path = join(w.sessionDir, newest)
      const size = statSync(path).size
      if (size === w.sessionPos) return
      const text = readFileSync(path, 'utf8').slice(Math.max(0, size - 16384))
      w.sessionPos = size
      const snippet = extractLastAssistant(text)
      if (snippet) {
        w.info.lastMessage = snippet
        this.emit('changed', w.info)
      }
    } catch {
      /* unknown schema or IO — degrade silently */
    }
  }
}

/** pi session.jsonl is one JSON object per line; scan back for assistant text. */
function extractLastAssistant(text: string): string | undefined {
  const lines = text.split('\n').filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    let obj: { content?: unknown; message?: { content?: unknown } }
    try {
      obj = JSON.parse(lines[i])
    } catch {
      continue
    }
    const content = (obj.content ?? obj.message?.content) as
      | Array<{ type: string; text?: string }>
      | undefined
    if (!Array.isArray(content)) continue
    const txt = content
      .filter((c) => c?.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text as string)
      .join(' ')
    if (txt) return txt.slice(-200)
  }
  return undefined
}
