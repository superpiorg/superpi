# AGENTS.md

Guidance for AI coding agents (and contributors) working on **superpi**.

## What this is

superpi is a Codex-Desktop-style **worktree + terminal manager for `omp` (oh-my-pi)**.
Open a folder → launch parallel agents, each a git worktree running `omp` in a real
terminal (xterm.js) → watch read-only status in a sidebar.

**Stack:** Electron 31 · electron-vite 2 · Vite 5 · React 18 · TypeScript 5 ·
Tailwind 3 · xterm.js · node-pty (native) · simple-git. The agent runtime is **`omp`**.

## Architecture invariants (do not break)

1. **Three-process Electron split.** Main (`src/main`) · Preload (`src/preload`) · Renderer (`src/renderer`).
   The renderer is sandboxed: `contextIsolation: true`, `nodeIntegration: false`. The preload is the
   **only** bridge — never expose `ipcRenderer` directly; always extend the typed `SuperpiAPI`.
2. **`src/shared/types.ts` is the IPC contract** — the single source of truth shared by all three
   processes. Changing a channel means updating the interface, the preload mapping, and the main
   handler together. `tsc` catches drift, but only if all three are updated.
3. **Workspace-centric model.** Exactly one folder is open (`WorkspaceController`). Agents are
   worktrees *inside* it under `<workspace>/.superpi/<id>`. `AgentStore.list()` is scoped to the
   current workspace — don't return agents from other workspaces. On creation each worktree gets the
   workspace's `node_modules` symlinked in (`linkNodeModules`) so it's instantly buildable without
   `npm install` — don't remove this.
4. **Passive monitoring only.** Status is *read-only*, derived from:
   - the monitor hook's append-only `events.jsonl` (`SUPERPI_EVENTS`), and
   - `omp`'s session `.jsonl` (last assistant text).
   Do **not** add Approve/Stop/send-to-agent features as a casual edit — that crosses into
   `omp --mode rpc` territory (see Roadmap in README) and changes the security/perf model.
5. **`omp` is launched via a login shell:** `sh -lc "exec omp …"` so PATH/profile loads and the PTY
   closes on agent exit. The binary name is the single constant `AGENT_BIN` in `src/main/pi.ts`.

## Worktree isolation (do not break)

Each agent runs inside a **git worktree** at `<workspace>/.superpi/<agent-id>/`.
The CWD is the worktree root. The main working tree (the workspace folder itself)
is a *different* checkout and **MUST NOT be modified directly**.

- **NEVER use absolute paths** in tools (`read`, `edit`, `write`, `search`, `find`,
  `bash`, `ast_grep`). Absolute paths bypass the CWD and hit the main tree or
  another agent's worktree.
- **Always use relative paths** (`src/main/foo.ts`). They resolve against the
  worktree root and stay inside the agent's sandbox.
- The env var `SUPERPI_WORKTREE` carries the absolute worktree path. Harness
  tooling SHOULD reject any path that resolves outside this directory.
- Changes are committed to the agent's branch (`superpi/<shortid>`), never to
  `main`. Merging happens separately — outside the agent's scope.

## File responsibilities

|Area|Files|Owns|
|---|---|---|
|Contract|`src/shared/types.ts`|all IPC types + `SuperpiAPI`|
|Main bootstrap|`main/index.ts`|window, `disableHardwareAcceleration()`, argv→workspace, event wiring|
|IPC|`main/ipc.ts`|handlers for workspace/agent/config/terminal/status|
|State|`main/workspace.ts`, `agents.ts`, `configs.ts`|controllers + JSON persistence in `~/.superpi/`|
|Git|`main/worktree.ts`, `git.ts`|worktree add/remove, repo check, `git init`|
|Terminal|`main/terminal.ts`|one node-pty per agent + 64 KiB scrollback ring|
|Status|`main/status.ts`|polls events + session files every 300 ms|
|Launch|`main/pi.ts`, `resources.ts`|`omp` argv/env (`SUPERPI_*`), monitor-hook path|
|Preload|`preload/index.ts`|`contextBridge.exposeInMainWorld('superpi', …)`|
|Renderer|`renderer/src/*`|React UI; `App.tsx` routes Welcome → GitInitBanner → workspace|

## Conventions (enforced project rules)

These are lint rules that **will** fire on violations:

- **`ts-no-tiny-functions`** — don't extract a function whose body is one expression/`return`; inline it.
  Exceptions: a durable exported contract, ≥3 lockstep call sites, a callback identity, a type guard, or a
  non-obvious formula. (Status→style maps are `Record`s, not functions.)
- **`ts-set-map`** — `Record<K,V>` for small static lookup tables; `Set`/`Map` only for dynamic,
  runtime-mutated collections. The agent/pty/watch registries are legitimately `Map`s.
- **`ts-promise-with-resolvers`** — use `Promise.withResolvers()`, not `new Promise((resolve,reject) => …)`.

Other conventions:

- **Static lookup → `Record`.** See `STATUS_DOT` / `STATUS_STYLE` in the renderer.
- **Terminal I/O uses `ipcRenderer.send`** (fire-and-forget, latency-sensitive); everything else uses `invoke`.
- **Icons are inlined SVG** in the components that use them (no icon dependency, no one-line wrapper components).
- **Tailwind** for all styling; dark `zinc` palette. No CSS files except `index.css` (Tailwind directives).

## Build, test, verify

```bash
npm run typecheck     # tsc on node + web projects — must be clean
npm run build         # electron-vite build → out/{main,preload,renderer}
npm test              # headless: WorktreeManager lifecycle + StatusWatcher parsing
```

There is **no display/xvfb in CI-like environments**, so the Electron window cannot be launched
headlessly. Verify the agent runtime directly with the real binary instead:

```bash
TMP=$(mktemp -d)
SUPERPI_EVENTS="$TMP/e.jsonl" omp -p --session-dir "$TMP" \
  -e resources/monitor.ts --thinking minimal "Reply with exactly: PONG"
cat "$TMP/e.jsonl"   # expect session_start → agent_start → turn_start → turn_end → agent_end
```

If that event sequence appears, the monitor hook + StatusWatcher contract is intact.

## Native module note

`node-pty` is rebuilt against Electron's ABI by `postinstall` (`electron-builder install-app-deps`).
**Bumping the Electron major version requires a rebuild** — re-run `npm install` (or
`npx electron-rebuild -f -w node-pty`). The bundled build then loads in Electron's main process.

## Extension points

- **Configurable agent binary** — `AGENT_BIN` in `src/main/pi.ts` (currently `'omp'`).
- **Active control** — migrate selected agents to `omp --mode rpc`; the JSON-RPC protocol is documented
  at `omp://rpc.md`. This is additive to the current passive model.
