import { app } from 'electron'
import { join } from 'node:path'

/**
 * Absolute path to the bundled monitor hook, loadable via `pi -e <path>`.
 * Kept separate from paths.ts so the pure path/logic modules stay free of
 * the electron dependency and are testable in plain Node.
 */
export function monitorHookPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'monitor.ts')
    : join(app.getAppPath(), 'resources', 'monitor.ts')
}
