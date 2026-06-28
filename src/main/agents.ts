import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { AgentDescriptor, AgentKind } from '@shared/types'
import { AGENTS_FILE, APP_DIR } from './paths'

/**
 * Persists all agents to ~/.superpi/agents.json and emits 'changed' for the
 * current workspace's agents whenever the set mutates.
 */
export class AgentStore extends EventEmitter {
  private agents = new Map<string, AgentDescriptor>()
  private workspace: string | null = null

  constructor() {
    super()
    mkdirSync(APP_DIR, { recursive: true })
    this.load()
  }

  /** Scopes list()/events to a workspace. Pass null to show none. */
  setWorkspace(path: string | null): void {
    this.workspace = path
    this.emit('changed', this.list())
  }

  private load(): void {
    if (!existsSync(AGENTS_FILE)) return
    try {
      const raw = JSON.parse(readFileSync(AGENTS_FILE, 'utf8')) as AgentDescriptor[]
      for (const a of raw as Array<AgentDescriptor & { kind?: AgentKind }>) {
        a.kind ??= 'omp'
        this.agents.set(a.id, a)
      }
    } catch {
      /* corrupt store — start fresh */
    }
  }

  private persist(): void {
    writeFileSync(AGENTS_FILE, JSON.stringify([...this.agents.values()], null, 2))
    this.emit('changed', this.list())
  }

  list(): AgentDescriptor[] {
    const all = [...this.agents.values()].sort((a, b) => a.createdAt - b.createdAt)
    return this.workspace ? all.filter((a) => a.workspacePath === this.workspace) : []
  }

  recentWorkspaces(): string[] {
    const seen = new Set<string>()
    for (const a of this.agents.values()) seen.add(a.workspacePath)
    return [...seen]
  }

  get(id: string): AgentDescriptor | undefined {
    return this.agents.get(id)
  }

  upsert(a: AgentDescriptor): void {
    this.agents.set(a.id, a)
    this.persist()
  }

  rename(id: string, name: string): AgentDescriptor | undefined {
    const a = this.agents.get(id)
    if (!a) return undefined
    a.name = name
    this.persist()
    return a
  }

  remove(id: string): AgentDescriptor | undefined {
    const a = this.agents.get(id)
    this.agents.delete(id)
    this.persist()
    return a
  }
}
