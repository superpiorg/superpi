import { eventsFileFor } from './paths'
import { monitorHookPath } from './resources'
import type { AgentConfig } from '@shared/types'

export interface PiLaunchConfig {
  /** argv passed to `pi`. */
  args: string[]
  env: NodeJS.ProcessEnv
}

/**
 * Builds the `omp` invocation for an agent:
 *   omp --session-dir <dir> -e <monitor-hook.ts> [--model ..] [--thinking ..] [extraArgs]
 * with SUPERPI_* env so the hook can locate its per-agent events file and the
 * agent environment carries the worktree root for path isolation.
 */
export function buildPiLaunchConfig(
  agentId: string,
  sessionDir: string,
  worktreePath: string,
  config?: AgentConfig,
  resume?: boolean
): PiLaunchConfig {
  const args = ['--session-dir', sessionDir, '-e', monitorHookPath()]
  if (resume) args.push('--continue')
  if (config?.model) args.push('--model', config.model)
  if (config?.thinking) args.push('--thinking', config.thinking)
  if (config?.extraArgs) args.push(...splitArgs(config.extraArgs))
  if (config?.firstMessage && !resume) args.push(config.firstMessage)
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPERPI: '1',
    SUPERPI_AGENT_ID: agentId,
    SUPERPI_EVENTS: eventsFileFor(agentId),
    SUPERPI_WORKTREE: worktreePath
  }
  return { args, env }
}

/**
 * Builds a `sh -lc` command that execs the agent binary (omp) with the given
 * args. A login shell loads PATH/profile so `omp` resolves; `exec` replaces the
 * shell so the PTY closes when the agent exits.
 */
/** Binary launched for each agent. Will become configurable. */
const AGENT_BIN = 'omp'

export function buildPiShellCommand(args: string[]): string {
  return 'exec ' + AGENT_BIN + ' ' + args.map(shellQuote).join(' ')
}

/** Builds a plain login shell command for terminal agents (no omp). */
export function buildPlainShellCommand(): string {
  return 'exec "$SHELL" -l'
}

/** Split a user-typed arg string respecting simple single/double quoting. */
function splitArgs(s: string): string[] {
  const matches = s.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)
  return matches ? matches.map((t) => t.replace(/^["']|["']$/g, '')) : []
}

function shellQuote(s: string): string {
  if (s === '') return "''"
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(s)) return s
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}
