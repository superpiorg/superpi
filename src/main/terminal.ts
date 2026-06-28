import * as pty from 'node-pty'
import { EventEmitter } from 'node:events'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import type { AgentConfig, AgentKind } from '@shared/types'
import { buildPiLaunchConfig, buildPiShellCommand, buildPlainShellCommand, sanitizeEnv } from './pi'
import { lockFileFor } from './paths'

/** Max bytes of scrollback retained per agent for replay on (re)attach. */
const RING_CAP = 64 * 1024

interface PtyEntry {
  pty: pty.IPty
  ring: string
}

/**
 * Owns one node-pty process per agent, spawning `pi` in the worktree. Emits
 * 'data' (id, chunk) and 'exit' (id, code). Keeps a small ring buffer so a
 * renderer terminal can replay recent output when it (re)attaches.
 */
export class TerminalManager extends EventEmitter {
  private entries = new Map<string, PtyEntry>()

  spawn(
    id: string,
    cwd: string,
    sessionDir: string,
    kind: AgentKind,
    config?: AgentConfig,
    cols = 100,
    rows = 30,
    resume?: boolean
  ): void {
    if (this.entries.has(id)) return

    const shell = process.env['SHELL'] || '/bin/bash'
    const isTerminal = kind === 'terminal'

    const piCfg = isTerminal ? null : buildPiLaunchConfig(id, sessionDir, cwd, config, resume)
    const command = isTerminal
      ? buildPlainShellCommand()
      : buildPiShellCommand(piCfg!.args)

    const env = isTerminal
      ? sanitizeEnv({ ...process.env, SUPERPI: '1' })
      : sanitizeEnv(piCfg!.env)

    const p = pty.spawn(shell, ['-lc', command], {
      cwd,
      env,
      cols,
      rows,
      name: 'xterm-256color'
    })

    const entry: PtyEntry = { pty: p, ring: '' }
    const lockPath = lockFileFor(id)
    writeFileSync(lockPath, String(process.pid))
    p.onData((data) => {
      entry.ring = (entry.ring + data).slice(-RING_CAP)
      this.emit('data', id, data)
    })
    p.onExit(({ exitCode }) => {
      try { unlinkSync(lockPath) } catch { /* already gone */ }
      this.emit('exit', id, exitCode)
      this.entries.delete(id)
    })
    this.entries.set(id, entry)
  }

  ring(id: string): string {
    return this.entries.get(id)?.ring ?? ''
  }

  size(id: string): { cols: number; rows: number } | null {
    const e = this.entries.get(id)
    return e ? { cols: e.pty.cols, rows: e.pty.rows } : null
  }

  write(id: string, data: string): void {
    this.entries.get(id)?.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    try {
      this.entries.get(id)?.pty.resize(Math.max(1, cols), Math.max(1, rows))
    } catch {
      /* pty may have exited */
    }
  }

  kill(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    try {
      e.pty.kill()
    } catch {
      /* ignore */
    }
    try { unlinkSync(lockFileFor(id)) } catch { /* already gone */ }
    this.entries.delete(id)
  }

  killAll(): void {
    for (const id of [...this.entries.keys()]) this.kill(id)
  }
  has(id: string): boolean {
    return this.entries.has(id)
  }

  /** True when a lock file exists and its PID belongs to a different running process. */
  isOwnedByOther(id: string): boolean {
    const path = lockFileFor(id)
    if (!existsSync(path)) return false
    try {
      const pid = parseInt(readFileSync(path, 'utf8'), 10)
      if (pid === process.pid) return false
      process.kill(pid, 0) // throws ESRCH if not alive
      return true
    } catch {
      return false
    }
  }
}
