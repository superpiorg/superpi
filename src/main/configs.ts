import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import type { AgentConfig } from '@shared/types'
import { APP_DIR, CONFIGS_FILE } from './paths'

const SEED: AgentConfig = { id: 'default', name: 'Default', isDefault: true }

/** Persists agent launch presets to ~/.superpi/configs.json. */
export class ConfigStore extends EventEmitter {
  private configs: AgentConfig[] = []

  constructor() {
    super()
    mkdirSync(APP_DIR, { recursive: true })
    this.load()
  }

  private load(): void {
    if (existsSync(CONFIGS_FILE)) {
      try {
        const raw = JSON.parse(readFileSync(CONFIGS_FILE, 'utf8'))
        if (Array.isArray(raw)) this.configs = raw
      } catch {
        this.configs = []
      }
    }
    if (this.configs.length === 0) this.configs = [{ ...SEED }]
    this.normalizeDefaults()
    this.persist()
  }

  private normalizeDefaults(): void {
    const defaults = this.configs.filter((c) => c.isDefault)
    if (defaults.length === 0) this.configs[0].isDefault = true
    else for (const c of this.configs) if (c.isDefault && c !== defaults[0]) c.isDefault = false
  }

  private persist(): void {
    writeFileSync(CONFIGS_FILE, JSON.stringify(this.configs, null, 2))
    this.emit('changed', this.list())
  }

  list(): AgentConfig[] {
    return this.configs.map((c) => ({ ...c }))
  }

  get(id: string): AgentConfig | undefined {
    const c = this.configs.find((x) => x.id === id)
    return c ? { ...c } : undefined
  }

  default(): AgentConfig {
    return { ...(this.configs.find((c) => c.isDefault) ?? this.configs[0]) }
  }

  save(cfg: AgentConfig): AgentConfig {
    const next = { ...cfg }
    if (!next.id || next.id === 'new') next.id = randomUUID()
    const idx = this.configs.findIndex((c) => c.id === next.id)
    if (idx >= 0) this.configs[idx] = next
    else this.configs.push(next)
    if (next.isDefault) for (const c of this.configs) if (c.id !== next.id) c.isDefault = false
    this.normalizeDefaults()
    this.persist()
    return { ...next }
  }

  delete(id: string): AgentConfig[] {
    if (this.configs.length <= 1) return this.list()
    this.configs = this.configs.filter((c) => c.id !== id)
    this.normalizeDefaults()
    this.persist()
    return this.list()
  }
}
