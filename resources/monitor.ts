// pi monitor hook — loaded into each agent via `pi -e <this file>`.
// Forwards agent lifecycle events as append-only JSONL to $SUPERPI_EVENTS,
// which the desktop app tails to render a read-only status panel.
//
// Runs inside pi's own process, where @oh-my-pi/pi-coding-agent is available.
// The type-only import is erased at transpile time.
import { appendFileSync } from 'node:fs'
import type { HookAPI } from '@oh-my-pi/pi-coding-agent/extensibility/hooks'

export default function monitor(pi: HookAPI): void {
  const out = process.env.SUPERPI_EVENTS
  if (!out) return

  const emit = (type: string, data: Record<string, unknown> = {}): void => {
    try {
      appendFileSync(out, JSON.stringify({ ts: Date.now(), type, data }) + '\n')
    } catch {
      /* events file unavailable — skip */
    }
  }

  pi.on('session_start', () => emit('session_start'))
  pi.on('turn_start', () => emit('turn_start'))
  pi.on('turn_end', () => emit('turn_end'))
  pi.on('agent_start', () => emit('agent_start'))
  pi.on('agent_end', () => emit('agent_end'))
  pi.on('tool_call', (e) => emit('tool_call', { tool: e.toolName }))
  pi.on('tool_result', (e) => emit('tool_result', { tool: e.toolName, isError: e.isError }))
}
